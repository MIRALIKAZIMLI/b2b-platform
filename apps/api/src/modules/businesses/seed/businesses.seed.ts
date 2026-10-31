// businesses başlangıç verisi (F2.3a): faaliyet türleri. `pnpm db:seed` çalıştırır; idempotendir.
// migrator rolüyle, tek işlemde ve platform bağlamında yazar (G tablosu yazma politikası).
// Kimlik veritabanında üretildiği için eşleşme `name->>'az'` ile yapılır; var olan atlanır
// (adminin sonradan yaptığı düzenleme ezilmez).
import { PILOT_ACTIVITY_TYPES } from './activity-types';

/** pg `Client` / `PoolClient` uyar (modüller pg'yi içe aktarmaz; bağlantıyı cli.ts açar). */
export interface SeedClient {
  query(text: string, params?: unknown[]): Promise<{ rowCount: number | null; rows: unknown[] }>;
}

export interface BusinessesSeedResult {
  /** Bu çalıştırmada eklenen satır sayısı. */
  readonly inserted: number;
}

export async function seedBusinesses(client: SeedClient): Promise<BusinessesSeedResult> {
  await client.query('begin');
  try {
    await client.query("select set_config('app.is_platform', 'true', true)");
    let inserted = 0;
    for (const [index, name] of PILOT_ACTIVITY_TYPES.entries()) {
      const result = await client.query(
        `insert into activity_types (name, is_active, sort_order)
         select $1::jsonb, true, $2
          where not exists (select 1 from activity_types where name->>'az' = $3)`,
        [JSON.stringify(name), index + 1, name.az],
      );
      inserted += result.rowCount ?? 0;
    }
    await client.query('commit');
    return { inserted };
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}
