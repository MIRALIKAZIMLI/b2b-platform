// F2.11b test kurulumu: toptancı (admin veya temsilci üyesiyle), perakendeci (gizlilik, kişisel
// veri, logo), bölge ağacı. Satırlar tablo sahibi `migrator` ile platform bağlamında yazılır;
// test edilen uç RLS'e tabi app_user ile çalışır. (Modül sınırı: businesses fikstürünün kopyası.)
import { randomUUID } from 'node:crypto';
import { insertTestUser, randomTestPhone } from '../../../../test/users';
import { platformRows } from './fixtures';

export async function newRegion(name: string, parentId?: string): Promise<string> {
  const [row] = await platformRows<{ id: string }>(
    `insert into regions (country_code, type, parent_id, name)
     values ('AZ', $1, $2, $3::jsonb) returning id`,
    [parentId === undefined ? 'city' : 'district', parentId ?? null, JSON.stringify({ az: name })],
  );
  if (row === undefined) throw new Error('bölge eklenemedi');
  return row.id;
}

export async function newActivityType(name: string): Promise<string> {
  const [row] = await platformRows<{ id: string }>(
    `insert into activity_types (name, is_active, sort_order)
     values ($1::jsonb, true, 500) returning id`,
    [JSON.stringify({ az: name })],
  );
  if (row === undefined) throw new Error('faaliyet türü eklenemedi');
  return row.id;
}

/** İşletmeye şablondan rol + üyelik; isteğe bağlı temsilci bölgeleri. Kullanıcı kimliği döner. */
export async function addMember(
  businessId: string,
  templateCode: string,
  options: { readonly phone?: string; readonly regionIds?: readonly string[] } = {},
): Promise<string> {
  const userId = randomUUID();
  await insertTestUser({ id: userId, phone: options.phone ?? randomTestPhone() });
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
  for (const regionId of options.regionIds ?? []) {
    await platformRows(
      'insert into membership_regions (membership_id, region_id) values ($1, $2)',
      [membershipId, regionId],
    );
  }
  return userId;
}

/** Onaylı, aktif toptancı + admin; hizmet bölgeleri verilirse yazılır. */
export async function newSeller(
  regionId: string,
  serviceAreas: readonly string[] = [],
): Promise<{ businessId: string; adminUserId: string }> {
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
  for (const area of serviceAreas) {
    await platformRows('insert into service_areas (seller_id, region_id) values ($1, $2)', [
      businessId,
      area,
    ]);
  }
  const adminUserId = await addMember(businessId, 'seller_business_admin');
  return { businessId, adminUserId };
}

export interface BuyerInput {
  readonly legalName: string;
  readonly regionId: string;
  readonly activityTypeId: string;
  readonly listed?: boolean;
  readonly verified?: boolean;
  readonly voen?: string;
  readonly businessPhone?: string;
  readonly addressLine?: string;
  readonly contactName?: string;
  readonly personalPhone?: string;
  readonly email?: string;
  readonly privacy?: Partial<
    Record<
      | 'show_logo'
      | 'show_address'
      | 'show_business_phone'
      | 'show_voen'
      | 'show_contact_name'
      | 'show_personal_contact',
      boolean
    >
  >;
  readonly logo?: boolean;
  /** İşletme admininin giriş telefonu. */
  readonly adminPhone?: string;
}

/** Onaylı `buyer` yetenekli perakendeci; tüm alanlar dolu, görünürlük `privacy` ile. */
export async function newBuyer(input: BuyerInput): Promise<string> {
  const id = randomUUID();
  await platformRows(
    `insert into businesses
       (id, legal_name, region_id, timezone, created_via, voen, business_phone, address_line,
        verified_at)
     values ($1, $2, $3, 'Asia/Baku', 'self_signup', $4, $5, $6, $7)`,
    [
      id,
      input.legalName,
      input.regionId,
      input.voen ?? null,
      input.businessPhone ?? null,
      input.addressLine ?? 'Nizami küç. 1',
      input.verified === true ? new Date() : null,
    ],
  );
  await platformRows(
    `insert into business_capabilities (business_id, capability, status, approved_at)
     values ($1, 'buyer', 'approved', now())`,
    [id],
  );
  await platformRows(
    `insert into buyer_profiles (business_id, activity_type_id, listed_in_directory)
     values ($1, $2, $3)`,
    [id, input.activityTypeId, input.listed ?? true],
  );
  const p = input.privacy ?? {};
  await platformRows(
    `insert into business_privacy
       (business_id, show_logo, show_address, show_business_phone, show_voen, show_contact_name,
        show_personal_contact)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      p.show_logo ?? false,
      p.show_address ?? false,
      p.show_business_phone ?? false,
      p.show_voen ?? false,
      p.show_contact_name ?? false,
      p.show_personal_contact ?? false,
    ],
  );
  await platformRows(
    `insert into person_data (id, business_id, contact_name, personal_phone, email)
     values ($5, $1, $2, $3, $4)`,
    [
      id,
      input.contactName ?? 'Aysel Məmmədova',
      input.personalPhone ?? null,
      input.email ?? null,
      randomUUID(),
    ],
  );
  const adminUserId = await addMember(id, 'buyer_business_admin', {
    ...(input.adminPhone === undefined ? {} : { phone: input.adminPhone }),
  });
  if (input.logo === true) {
    const fileId = randomUUID();
    await platformRows(
      `insert into files
         (id, owner_business_id, purpose, bucket, object_key, content_type, size_bytes, status,
          created_by)
       values ($1, $2, 'logo', 'public', $3, 'image/png', 100, 'ready', $4)`,
      [fileId, id, `${id}/logo/${fileId}.png`, adminUserId],
    );
    await platformRows('update businesses set logo_file_id = $2 where id = $1', [id, fileId]);
  }
  return id;
}
