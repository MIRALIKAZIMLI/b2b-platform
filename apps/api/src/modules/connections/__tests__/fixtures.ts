// F2.12a test kurulumu: seed'ler, bölge, toptancı / perakendeci, üyeler, bağlantı geçmişi.
// Genel satırlar tablo sahibi `migrator` ile platform bağlamında; P/T bağlantı satırları ilgili
// işletmenin bağlamında yazılır (platform bu tablolara yazamaz). Test edilen uç app_user ile
// RLS'e tabidir. (Modül sınırı: directory test fikstürlerinin kısaltılmış kopyası.)
import { randomUUID } from 'node:crypto';
import { connectAsMigrator } from '../../../../test/db-clients';
import { insertTestUser, randomTestPhone } from '../../../../test/users';
import { SystemClock } from '../../../core/clock';
import { UuidV7IdGenerator } from '../../../core/id-generator';
import { seedAccess } from '../../access';
import { seedBilling } from '../../billing';
import { seedBusinesses } from '../../businesses';
import { seedI18n } from '../../i18n';

const ids = new UuidV7IdGenerator(new SystemClock());

export async function runSeeds(): Promise<void> {
  const client = await connectAsMigrator();
  try {
    await seedI18n(client);
    await seedBusinesses(client);
    await seedBilling(client, () => ids.next());
    await seedAccess(client, () => ids.next());
  } finally {
    await client.end();
  }
}

/** Platform bağlamında (migrator, `app.is_platform`) sorgu. */
export async function platformRows<Row extends Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<Row[]> {
  return await contextRows({ platform: true }, text, params);
}

/** Bir işletmenin bağlamında (migrator, `app.business_id`) sorgu; RLS o işletmeye göre. */
export async function businessRows<Row extends Record<string, unknown>>(
  businessId: string,
  text: string,
  params: unknown[] = [],
): Promise<Row[]> {
  return await contextRows({ businessId }, text, params);
}

async function contextRows<Row extends Record<string, unknown>>(
  context: { readonly platform?: boolean; readonly businessId?: string },
  text: string,
  params: unknown[],
): Promise<Row[]> {
  const client = await connectAsMigrator();
  try {
    await client.query('begin');
    if (context.platform === true) {
      await client.query("select set_config('app.is_platform', 'true', true)");
    }
    if (context.businessId !== undefined) {
      await client.query("select set_config('app.business_id', $1, true)", [context.businessId]);
    }
    const result = await client.query<Row>(text, params);
    await client.query('commit');
    return result.rows;
  } finally {
    await client.end();
  }
}

export async function newRegion(name: string, parentId?: string): Promise<string> {
  const [row] = await platformRows<{ id: string }>(
    `insert into regions (country_code, type, parent_id, name)
     values ('AZ', $1, $2, $3::jsonb) returning id`,
    [parentId === undefined ? 'city' : 'district', parentId ?? null, JSON.stringify({ az: name })],
  );
  if (row === undefined) throw new Error('bölge eklenemedi');
  return row.id;
}

export interface Member {
  readonly userId: string;
  readonly membershipId: string;
}

/** İşletmeye şablondan rol + üyelik; isteğe bağlı temsilci bölgeleri. */
export async function addMember(
  businessId: string,
  templateCode: string,
  regionIds: readonly string[] = [],
): Promise<Member> {
  const userId = randomUUID();
  await insertTestUser({ id: userId, phone: randomTestPhone() });
  await platformRows(
    `insert into roles (id, business_id, name, capability, is_business_admin, source_template_id)
     select $1, $2, name, capability, is_business_admin, id from role_templates where code = $3
     on conflict (business_id, source_template_id)
       where source_template_id is not null and not is_custom do nothing`,
    [randomUUID(), businessId, templateCode],
  );
  const [role] = await platformRows<{ id: string }>(
    `select r.id from roles r join role_templates t on t.id = r.source_template_id
      where r.business_id = $1 and t.code = $2 and not r.is_custom`,
    [businessId, templateCode],
  );
  if (role === undefined) throw new Error(`rol yok: ${templateCode}`);
  await platformRows(
    `insert into role_permissions (role_id, permission_code, scope)
     select $1, p.permission_code, p.default_scope
       from role_template_permissions p join role_templates t on t.id = p.template_id
      where t.code = $2
     on conflict do nothing`,
    [role.id, templateCode],
  );
  const membershipId = randomUUID();
  await platformRows(
    `insert into memberships (id, user_id, business_id, role_id, job_title_id)
     select $1, $2, $3, $4, j.id
       from job_titles j join role_templates t on t.id = j.role_template_id
      where t.code = $5 and j.code = t.code`,
    [membershipId, userId, businessId, role.id, templateCode],
  );
  for (const regionId of regionIds) {
    await platformRows(
      'insert into membership_regions (membership_id, region_id) values ($1, $2)',
      [membershipId, regionId],
    );
  }
  return { userId, membershipId };
}

async function startSubscription(businessId: string, planCode: string): Promise<void> {
  await platformRows(
    `insert into subscriptions
       (id, business_id, plan_id, status, current_period_start, current_period_end)
     select $1, $2, id, 'active', current_date, current_date + 30 from plans where code = $3`,
    [randomUUID(), businessId, planCode],
  );
}

export interface Seller {
  readonly businessId: string;
  readonly admin: Member;
}

/** Onaylı, aktif toptancı + admin + `pilot` aboneliği (haklar sınırsız). */
export async function newSeller(regionId: string): Promise<Seller> {
  const businessId = randomUUID();
  await platformRows(
    `insert into businesses (id, legal_name, region_id, timezone, created_via)
     values ($1, $2, $3, 'Asia/Baku', 'admin')`,
    [businessId, `Toptan ${businessId.slice(0, 8)}`, regionId],
  );
  await platformRows(
    `insert into business_capabilities (business_id, capability, status, approved_at)
     values ($1, 'seller', 'approved', now())`,
    [businessId],
  );
  await platformRows('insert into seller_profiles (business_id) values ($1)', [businessId]);
  await startSubscription(businessId, 'pilot');
  return { businessId, admin: await addMember(businessId, 'seller_business_admin') };
}

export interface Buyer {
  readonly businessId: string;
  readonly admin: Member;
}

/** Onaylı `buyer` yetenekli perakendeci + admin; dizinde görünürlüğü ayarlanabilir. */
export async function newBuyer(regionId: string, listed = true): Promise<Buyer> {
  const businessId = randomUUID();
  await platformRows(
    `insert into businesses (id, legal_name, region_id, timezone, created_via)
     values ($1, $2, $3, 'Asia/Baku', 'self_signup')`,
    [businessId, `Market ${businessId.slice(0, 8)}`, regionId],
  );
  await platformRows(
    `insert into business_capabilities (business_id, capability, status, approved_at)
     values ($1, 'buyer', 'approved', now())`,
    [businessId],
  );
  await platformRows(
    `insert into buyer_profiles (business_id, activity_type_id, listed_in_directory)
     select $1, id, $2 from activity_types order by sort_order, id limit 1`,
    [businessId, listed],
  );
  await platformRows('insert into business_privacy (business_id) values ($1)', [businessId]);
  return { businessId, admin: await addMember(businessId, 'buyer_business_admin') };
}

/**
 * Geçmiş istek satırı. F2.13a bekçisi gereği önce satıcı bağlamında `pending` eklenir, sonra
 * geçişi yapan tarafın bağlamında durum yazılır (kabul/red alıcı, geri çekme satıcı).
 */
export async function insertRequest(input: {
  readonly sellerId: string;
  readonly buyerId: string;
  readonly sentByUserId: string;
  readonly status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
  readonly createdAt: Date;
  readonly respondedAt?: Date;
  /** Kabul/red eden kullanıcı; verilmezse gönderen (FK yeterli). */
  readonly respondedByUserId?: string;
  readonly sellerLocalDate: string;
  /** Varsayılan: oluşturma + 14 gün. */
  readonly expiresAt?: Date;
}): Promise<string> {
  const id = ids.next();
  await businessRows(
    input.sellerId,
    `insert into connection_requests
       (id, seller_id, buyer_id, sent_by_user_id, status, expires_at,
        seller_local_date, created_at, updated_at)
     values ($1, $2, $3, $4, 'pending', coalesce($7::timestamptz, $5::timestamptz + interval '14 days'),
             $6, $5, $5)`,
    [
      id,
      input.sellerId,
      input.buyerId,
      input.sentByUserId,
      input.createdAt,
      input.sellerLocalDate,
      input.expiresAt ?? null,
    ],
  );
  if (input.status === 'accepted' || input.status === 'rejected') {
    await businessRows(
      input.buyerId,
      `update connection_requests
          set status = $2, responded_at = $3, responded_by_user_id = $4
        where id = $1`,
      [
        id,
        input.status,
        input.respondedAt ?? input.createdAt,
        input.respondedByUserId ?? input.sentByUserId,
      ],
    );
  } else if (input.status === 'withdrawn') {
    await businessRows(
      input.sellerId,
      `update connection_requests set status = 'withdrawn' where id = $1`,
      [id],
    );
  }
  return id;
}

/** Alıcı bağlamında bağlantı satırı (kabul F2.13'te; burada geçmiş kurulumu). */
export async function insertConnection(input: {
  readonly sellerId: string;
  readonly buyerId: string;
  readonly requestId: string;
  readonly startedAt: Date;
  readonly cancelled?: { readonly at: Date; readonly by: 'seller' | 'buyer' };
}): Promise<string> {
  const id = ids.next();
  // F2.13a bekçisi: bağlantı `active` doğar; iptal ayrı güncellemedir.
  await businessRows(
    input.buyerId,
    `insert into connections (id, seller_id, buyer_id, request_id, status, started_at)
     values ($1, $2, $3, $4, 'active', $5)`,
    [id, input.sellerId, input.buyerId, input.requestId, input.startedAt],
  );
  if (input.cancelled !== undefined) {
    await businessRows(
      input.buyerId,
      `update connections set status = 'cancelled', ended_at = $2, ended_by_side = $3
        where id = $1`,
      [id, input.cancelled.at, input.cancelled.by],
    );
  }
  return id;
}

export async function insertBlock(buyerId: string, sellerId: string, userId: string) {
  await businessRows(
    buyerId,
    'insert into blocks (buyer_id, seller_id, created_by_user_id) values ($1, $2, $3)',
    [buyerId, sellerId, userId],
  );
}
