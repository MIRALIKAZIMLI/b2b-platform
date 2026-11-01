// F1.7 entegrasyon/izolasyon testleri için ortak kurulum. Üst kayıtlar (para birimi, ülke, bölge,
// faaliyet alanı) platform bağlamında açılır; işletme satırları kendi kiracı bağlamında.
// Kodlar (XBA, XB) gerçek seed kodlarıyla çakışmaz; ON CONFLICT ile dosyalar arasında tekrar kullanılır.
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { type TenantTxContext, withPlatformTx, withTenantTx } from '../../../core/db';
import { insertTestUsers } from '../../../../test/users';

export const PLATFORM = { userId: randomUUID() };

export interface Refs {
  readonly regionId: string;
  readonly activityTypeId: string;
}

export async function createRefs(): Promise<Refs> {
  // F1.5a: işlemi yapan platform kullanıcısı users'da olmalı (approved_by / created_by FK).
  await insertTestUsers(PLATFORM.userId);
  return await withPlatformTx(PLATFORM, async (tx) => {
    await tx.execute(sql`insert into currencies (code, symbol, decimals, is_active)
                         values ('XBA', 'X', 2, true) on conflict do nothing`);
    await tx.execute(sql`insert into countries
                           (code, name, default_currency, default_timezone, phone_prefix)
                         values ('XB', '{"az": "Test"}'::jsonb, 'XBA', 'Asia/Baku', '+997')
                         on conflict do nothing`);
    const region = await tx.execute<{ id: string }>(sql`
      insert into regions (country_code, parent_id, type, name)
      values ('XB', null, 'city', '{"az": "Test"}'::jsonb) returning id`);
    // sort_order seed listesinin sonrasında: aynı veritabanını paylaşan katalog sırası testi
    // (F2.3a) seed'in ilk türünü bekler; 0'da eşitlik rastgele kimlik sırasına kalıyordu.
    const activity = await tx.execute<{ id: string }>(sql`
      insert into activity_types (name, is_active, sort_order)
      values ('{"az": "Test"}'::jsonb, true, 1000) returning id`);
    const regionId = region.rows[0]?.id;
    const activityTypeId = activity.rows[0]?.id;
    if (regionId === undefined || activityTypeId === undefined) {
      throw new Error('test üst kayıtları oluşmadı');
    }
    return { regionId, activityTypeId };
  });
}

export function newTenant(): TenantTxContext {
  return { businessId: randomUUID(), userId: randomUUID() };
}

/** Kiracının kendi bağlamında (kayıt akışı gibi) işletme satırı açar. */
export async function createBusiness(tenant: TenantTxContext, refs: Refs): Promise<void> {
  await withTenantTx(tenant, (tx) =>
    tx.execute(sql`
      insert into businesses (id, legal_name, country_code, region_id, timezone, created_via)
      values (${tenant.businessId}, 'Test MMC', 'XB', ${refs.regionId}, 'Asia/Baku', 'self_signup')`),
  );
}
