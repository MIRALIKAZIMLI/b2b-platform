// F3.5a test kurulumu (modül sınırı: pricing-fixtures'ın kısaltılmış kopyası): seed'ler, bölge,
// toptancı / perakendeci, üyeler, HTTP yardımcıları, geçerli ürün gövdesi; .xlsx üretici ve
// F1.10 akışının sonucu olan `ready` içe aktarma dosyası.
// Genel satırlar tablo sahibi `migrator` ile platform bağlamında; P/T satırları ilgili işletmenin
// bağlamında yazılır.
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { connectAsMigrator } from '../../../../test/db-clients';
import { insertTestUser, randomTestPhone } from '../../../../test/users';
import { SystemClock } from '../../../core/clock';
import { UuidV7IdGenerator } from '../../../core/id-generator';
import type { FileStorage } from '../../../core/ports/file-storage';
import { seedAccess } from '../../access';
import { seedBilling } from '../../billing';
import { seedBusinesses } from '../../businesses';
import { seedI18n } from '../../i18n';
import { TokenService } from '../../identity';
import { seedCatalog } from '../../catalog';

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

/** Başlık + satırlar; ilk sayfa ürünler (okuyucu ilk sayfayı okur). */
export async function xlsx(header: readonly string[], rows: readonly unknown[][]): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('products');
  sheet.addRow([...header]);
  for (const row of rows) sheet.addRow([...row]);
  return Buffer.from(await book.xlsx.writeBuffer());
}

export const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** F1.10 sonucu: `ready` `import` dosya satırı (işletme bağlamında) + depoda nesne. */
export async function readyImportFile(
  storage: FileStorage,
  who: { businessId: string; admin: { userId: string } },
  body: Buffer,
  options: { purpose?: string; status?: string } = {},
): Promise<string> {
  const fileId = randomUUID();
  const purpose = options.purpose ?? 'import';
  const objectKey = `${who.businessId}/${purpose}/${fileId}.xlsx`;
  await platformRows(
    `insert into files (id, owner_business_id, purpose, bucket, object_key, content_type,
                        size_bytes, status, created_by)
     values ($1, $2, $3, 'private', $4, $5, $6, $7, $8)`,
    [
      fileId,
      who.businessId,
      purpose,
      objectKey,
      XLSX,
      body.length,
      options.status ?? 'ready',
      who.admin.userId,
    ],
  );
  await storage.put(objectKey, body, XLSX);
  return fileId;
}

/** exceljs `load` kendi `Buffer` (ArrayBuffer) tipini ister; Node Buffer'ın baytları kopyalanır. */
export function arrayBufferOf(body: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(body.byteLength);
  new Uint8Array(copy).set(body);
  return copy;
}
