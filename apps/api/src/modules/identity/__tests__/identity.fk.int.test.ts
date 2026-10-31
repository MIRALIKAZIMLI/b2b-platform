// Bekçi testi (Müfettiş D2): bu dört users FK'sı drizzle şemasında yok, yalnızca migration'da
// (drizzle/0007_identity.sql). İleride bir migration yanlışlıkla düşürürse bu test kırılır.
import { describe, expect, it } from 'vitest';
import { queryAsOwner } from '../../../../test/isolation';

const EXPECTED = [
  {
    name: 'business_capabilities_approved_by_users_id_fk',
    table: 'business_capabilities',
    column: 'approved_by',
  },
  { name: 'businesses_verified_by_users_id_fk', table: 'businesses', column: 'verified_by' },
  {
    name: 'entitlement_overrides_created_by_users_id_fk',
    table: 'entitlement_overrides',
    column: 'created_by',
  },
  // F2.2: başvuruyu inceleyen platform kullanıcısı (drizzle/0014_seller_applications.sql).
  {
    name: 'seller_applications_reviewed_by_users_id_fk',
    table: 'seller_applications',
    column: 'reviewed_by',
  },
  { name: 'settings_updated_by_users_id_fk', table: 'settings', column: 'updated_by' },
];

describe('users FK bekçisi', () => {
  it("F1.5a: migration'daki users FK'ları (şemada olmayan) mevcut", async () => {
    const rows = await queryAsOwner<{
      name: string;
      table: string;
      column: string;
      ref_table: string;
      ref_column: string;
    }>(
      `select c.conname as name,
              c.conrelid::regclass::text as table,
              a.attname as column,
              c.confrelid::regclass::text as ref_table,
              ra.attname as ref_column
         from pg_constraint c
         join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
         join pg_attribute ra on ra.attrelid = c.confrelid and ra.attnum = c.confkey[1]
        where c.contype = 'f' and c.conname = any($1::text[])
        order by c.conname`,
      [EXPECTED.map((fk) => fk.name)],
    );

    expect(rows).toEqual(EXPECTED.map((fk) => ({ ...fk, ref_table: 'users', ref_column: 'id' })));
  });
});
