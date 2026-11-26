// F3.3a test kurulumu (modül sınırı: platform-admin buyer-fixtures ve fixtures'ın kısaltılmış
// kopyası): seed'ler (katalog dahil), bölge, toptancı / perakendeci, üyeler, aktif bağlantı, HTTP
// yardımcıları; geçerli ürün gövdesi ve seed'den kategori seçimi. Genel satırlar tablo sahibi
// `migrator` ile platform bağlamında; P/T satırları ilgili işletmenin bağlamında yazılır.
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { connectAsMigrator } from '../../../../test/db-clients';
import { insertTestUser, insertTestUsers, randomTestPhone } from '../../../../test/users';
import { SystemClock } from '../../../core/clock';
import { UuidV7IdGenerator } from '../../../core/id-generator';
import { seedAccess } from '../../access';
import { seedBilling } from '../../billing';
import { seedBusinesses } from '../../businesses';
import { seedI18n } from '../../i18n';
import { TokenService } from '../../identity';
import { seedCatalog } from '../catalog.seed';

const ids = new UuidV7IdGenerator(new SystemClock());

export async function runSeeds(): Promise<void> {
  const client = await connectAsMigrator();
  try {
    await seedI18n(client);
    await seedBusinesses(client);
    await seedBilling(client, () => ids.next());
    await seedAccess(client, () => ids.next());
    await seedCatalog(client);
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
  readonly proposedPaymentTermDays?: number;
}): Promise<string> {
  const id = ids.next();
  await businessRows(
    input.sellerId,
    `insert into connection_requests
       (id, seller_id, buyer_id, sent_by_user_id, status, expires_at,
        seller_local_date, created_at, updated_at, proposed_payment_term_days)
     values ($1, $2, $3, $4, 'pending', coalesce($7::timestamptz, $5::timestamptz + interval '14 days'),
             $6, $5, $5, $8)`,
    [
      id,
      input.sellerId,
      input.buyerId,
      input.sentByUserId,
      input.createdAt,
      input.sellerLocalDate,
      input.expiresAt ?? null,
      input.proposedPaymentTermDays ?? null,
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
  // F2.13a bekçisi: bağlantı `active` ve isteğin yanıt anında doğar (`startedAt` = isteğin
  // `respondedAt`'i olmalı); iptal ayrı güncellemedir.
  await businessRows(
    input.buyerId,
    `insert into connections (id, seller_id, buyer_id, request_id, status, started_at)
     select $1, $2, $3, $4, 'active', responded_at from connection_requests where id = $4`,
    [id, input.sellerId, input.buyerId, input.requestId],
  );
  if (input.cancelled !== undefined) {
    // F2.15a bekçisi: iptal eden tarafın bağlamında, dört bitiş alanı dolu.
    const side = input.cancelled.by === 'seller' ? input.sellerId : input.buyerId;
    await businessRows(
      side,
      `update connections set status = 'cancelled', ended_at = $2, ended_by_side = $3,
              end_reason = 'other', ended_by_user_id = $4
        where id = $1`,
      [id, input.cancelled.at, input.cancelled.by, await firstMemberUserId(side)],
    );
  }
  return id;
}

async function firstMemberUserId(businessId: string): Promise<string> {
  const [member] = await platformRows<{ user_id: string }>(
    `select user_id from memberships where business_id = $1 order by created_at limit 1`,
    [businessId],
  );
  if (member === undefined) throw new Error('işletmenin üyesi yok');
  return member.user_id;
}

/** F2.14a: kabul edilmiş istek + aktif bağlantı (alıcı bağlamında, varsayılan koşullarla). */
export async function activeConnection(
  seller: Seller,
  buyer: Buyer,
  at: Date,
  proposedPaymentTermDays?: number,
): Promise<string> {
  const requestId = await insertRequest({
    sellerId: seller.businessId,
    buyerId: buyer.businessId,
    sentByUserId: seller.admin.userId,
    status: 'accepted',
    createdAt: at,
    sellerLocalDate: at.toISOString().slice(0, 10),
    ...(proposedPaymentTermDays === undefined ? {} : { proposedPaymentTermDays }),
  });
  return await insertConnection({
    sellerId: seller.businessId,
    buyerId: buyer.businessId,
    requestId,
    startedAt: at,
  });
}

/** Platform ekibinden kullanıcı (platform_staff S tablosu; migrator ile). */
export async function platformUser(role: 'super_admin' | 'content'): Promise<string> {
  const userId = randomUUID();
  await insertTestUsers(userId);
  const client = await connectAsMigrator();
  try {
    await client.query('insert into platform_staff (user_id, role) values ($1, $2)', [
      userId,
      role,
    ]);
  } finally {
    await client.end();
  }
  return userId;
}

export class TestHttp {
  constructor(private readonly app: NestFastifyApplication) {}

  http() {
    return request(this.app.getHttpServer());
  }

  async bearer(userId: string): Promise<{ Authorization: string }> {
    const signed = await this.app.get(TokenService).signAccess({ userId, sessionId: randomUUID() });
    return { Authorization: `Bearer ${signed.token}` };
  }
}

export interface SeedCategories {
  /** Seed'deki ilk üst kategori ve onun ilk alt kategorisi. */
  readonly root: string;
  readonly child: string;
  /** Başka bir üst kategorinin alt kategorisi. */
  readonly otherRoot: string;
  readonly otherChild: string;
}

export async function seedCategories(): Promise<SeedCategories> {
  const rows = await platformRows<{ root: string; child: string }>(
    `select r.id as root, (select c.id from categories c where c.parent_id = r.id
                             order by c.sort_order, c.id limit 1) as child
       from categories r
      where r.depth = 1 and r.is_active
        and exists (select 1 from categories c where c.parent_id = r.id)
      order by r.sort_order, r.id
      limit 2`,
  );
  const [first, second] = rows;
  if (first === undefined || second === undefined) throw new Error('seed kategorisi yok');
  return { root: first.root, child: first.child, otherRoot: second.root, otherChild: second.child };
}

/** Admin (platform) bağlamında yeni kök kategori; isteğe bağlı pasif. */
export async function newCategory(active = true, parentId: string | null = null): Promise<string> {
  const [row] = await platformRows<{ id: string }>(
    `insert into categories (parent_id, name, is_active) values ($1, $2::jsonb, $3) returning id`,
    [parentId, JSON.stringify({ az: `K ${randomUUID().slice(0, 8)}`, ru: 'K', tr: 'K' }), active],
  );
  if (row === undefined) throw new Error('kategori eklenemedi');
  return row.id;
}

/** Admin markası (`active`). */
export async function newActiveBrand(): Promise<string> {
  const id = randomUUID();
  await platformRows(`insert into brands (id, name, status) values ($1, $2, 'active')`, [
    id,
    `Marka ${id.slice(0, 12)}`,
  ]);
  return id;
}

/** Toptancının bekleyen marka talebi (DEFINER kuralını atlayarak doğrudan satır). */
export async function newRequestedBrand(sellerId: string, userId: string): Promise<string> {
  const id = randomUUID();
  await platformRows(
    `insert into brands (id, name, status, requested_by_business_id, requested_by_user_id)
     values ($1, $2, 'requested', $3, $4)`,
    [id, `Talep ${id.slice(0, 12)}`, sellerId, userId],
  );
  return id;
}

export function sku(prefix = 'SKU'): string {
  return `${prefix}-${randomUUID().slice(0, 12)}`;
}

/** Geçerli gövde: adet (H87) → koli 24 (XCT, satış birimi) → palet 60 koli (1.440). */
export function productBody(categoryId: string, overrides: Record<string, unknown> = {}) {
  return {
    sku: sku('P'),
    name: { az: 'Şampun 400 ml', ru: 'Шампунь 400 мл' },
    categoryId,
    baseUnitCode: 'H87',
    variants: [
      {
        sku: sku('V'),
        attributes: { volume_ml: 400 },
        gtin: '4006381333931',
        packaging: [
          { level: 'unit', unitCode: 'H87', baseQty: '1' },
          {
            level: 'case',
            unitCode: 'XCT',
            baseQty: '24',
            isSalesUnit: true,
            minOrderQty: '2',
            orderMultiple: '1',
          },
          { level: 'pallet', unitCode: 'XPX', baseQty: '1440' },
        ],
      },
    ],
    ...overrides,
  };
}
