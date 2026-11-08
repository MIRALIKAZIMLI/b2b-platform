// F2.6 test kurulumu: seed'ler ve toptancı / perakendeci işletmesi (yetenek, şablondan admin rolü,
// üyelik, `pilot` aboneliği, isteğe bağlı `warehouses.max` istisnası). Satırlar tablo sahibi
// `migrator` ile platform bağlamında yazılır; test edilen uçlar RLS'e tabi app_user ile çalışır.
import { randomUUID } from 'node:crypto';
import { connectAsMigrator } from '../../../../test/db-clients';
import { insertTestUser, randomTestPhone } from '../../../../test/users';
import { SystemClock } from '../../../core/clock';
import { UuidV7IdGenerator } from '../../../core/id-generator';
import { seedAccess } from '../../access';
import { seedBilling } from '../../billing';
import { seedI18n } from '../../i18n';
import { seedBusinesses } from '../seed/businesses.seed';

const ids = new UuidV7IdGenerator(new SystemClock());

export async function runSetupSeeds(): Promise<void> {
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
  const client = await connectAsMigrator();
  try {
    await client.query('begin');
    await client.query("select set_config('app.is_platform', 'true', true)");
    const result = await client.query<Row>(text, params);
    await client.query('commit');
    return result.rows;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.end();
  }
}

/** Testin kendi bölgesi (AZ ülkesi seed'den). */
export async function newRegion(name: string): Promise<string> {
  const [row] = await platformRows<{ id: string }>(
    `insert into regions (country_code, type, name) values ('AZ', 'city', $1::jsonb) returning id`,
    [JSON.stringify({ az: name })],
  );
  if (row === undefined) throw new Error('bölge eklenemedi');
  return row.id;
}

/** Var olan işletmeye şablondan rol ve üyelik; yeni kullanıcının kimliğini döner. */
export async function addMemberFromTemplate(
  businessId: string,
  templateCode: string,
): Promise<string> {
  const userId = randomUUID();
  await insertTestUser({ id: userId, phone: randomTestPhone() });
  // F2.8: aynı şablonun ikinci kopyası açılamaz (roles_business_template_copy_uq); varsa o rol kullanılır.
  await platformRows(
    `insert into roles (id, business_id, name, capability, is_business_admin, source_template_id)
     select $1, $2, name, capability, is_business_admin, id from role_templates where code = $3
     on conflict (business_id, source_template_id)
       where source_template_id is not null and not is_custom do nothing`,
    [randomUUID(), businessId, templateCode],
  );
  const [copy] = await platformRows<{ id: string }>(
    `select r.id from roles r join role_templates t on t.id = r.source_template_id
      where r.business_id = $1 and t.code = $2 and not r.is_custom`,
    [businessId, templateCode],
  );
  if (copy === undefined) throw new Error(`rol yok: ${templateCode}`);
  const roleId = copy.id;
  await platformRows(
    `insert into role_permissions (role_id, permission_code, scope)
     select $1, p.permission_code, p.default_scope
       from role_template_permissions p join role_templates t on t.id = p.template_id
      where t.code = $2
     on conflict do nothing`,
    [roleId, templateCode],
  );
  await platformRows(
    `insert into memberships (id, user_id, business_id, role_id, job_title_id)
     select $1, $2, $3, $4, j.id
       from job_titles j join role_templates t on t.id = j.role_template_id
      where t.code = $5 and j.code = t.code`,
    [randomUUID(), userId, businessId, roleId, templateCode],
  );
  return userId;
}

export interface TestBusiness {
  readonly businessId: string;
  /** İşletme admini (`<yetenek>_business_admin` şablonu). */
  readonly adminUserId: string;
}

/**
 * Onaylı yetenekli işletme + admin. `subscription: false` → abonelik yok (hak değeri yok).
 * `maxWarehouses` verilirse işletmeye özel `warehouses.max` istisnası (`null` = sınırsız).
 */
export async function newTestBusiness(
  options: {
    readonly capability?: 'seller' | 'buyer';
    readonly subscription?: boolean;
    readonly maxWarehouses?: number | null;
  } = {},
): Promise<TestBusiness> {
  const capability = options.capability ?? 'seller';
  const businessId = randomUUID();
  const regionId = await newRegion('F2.6 test');
  await platformRows(
    `insert into businesses (id, legal_name, region_id, timezone, created_via)
     values ($1, $2, $3, 'Asia/Baku', 'admin')`,
    [businessId, `F2.6 Test ${businessId.slice(0, 8)}`, regionId],
  );
  await platformRows(
    `insert into business_capabilities (business_id, capability, status)
     values ($1, $2, 'approved')`,
    [businessId, capability],
  );
  if (capability === 'seller') {
    await platformRows('insert into seller_profiles (business_id) values ($1)', [businessId]);
  }
  if (options.subscription !== false) {
    const plan = capability === 'seller' ? 'pilot' : 'buyer_free';
    await platformRows(
      `insert into subscriptions
         (id, business_id, plan_id, status, current_period_start, current_period_end)
       select $1, $2, id, 'active', current_date, current_date + 30 from plans where code = $3`,
      [randomUUID(), businessId, plan],
    );
  }
  if (options.maxWarehouses !== undefined) {
    await platformRows(
      `insert into entitlement_overrides (business_id, key, value)
       values ($1, 'warehouses.max', $2::jsonb)`,
      [businessId, JSON.stringify(options.maxWarehouses)],
    );
  }
  const adminUserId = await addMemberFromTemplate(businessId, `${capability}_business_admin`);
  return { businessId, adminUserId };
}
