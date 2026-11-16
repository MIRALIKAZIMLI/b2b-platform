// catalog başlangıç verisi (F3.1): birimler ve dönüşümler. `pnpm db:seed` çalıştırır; idempotendir.
// migrator rolüyle, tek işlemde ve platform bağlamında yazar (G tablosu yazma politikası). Var olan
// kod / çift atlanır (adminin sonradan yaptığı düzenleme ezilmez).
import { SEED_UNIT_CONVERSIONS, SEED_UNITS } from './seed/units';

/** pg `Client` / `PoolClient` uyar (modüller pg'yi içe aktarmaz; bağlantıyı cli.ts açar). */
export interface SeedClient {
  query(text: string, params?: unknown[]): Promise<{ rowCount: number | null; rows: unknown[] }>;
}

export interface CatalogSeedResult {
  /** Bu çalıştırmada eklenen satır sayısı. */
  readonly inserted: number;
}

export async function seedCatalog(client: SeedClient): Promise<CatalogSeedResult> {
  await client.query('begin');
  try {
    await client.query("select set_config('app.is_platform', 'true', true)");
    let inserted = 0;
    for (const unit of SEED_UNITS) {
      const result = await client.query(
        `insert into units (code, kind, name, abbreviation, allows_decimal, is_active)
         values ($1, $2, $3::jsonb, $4::jsonb, $5, true)
         on conflict (code) do nothing`,
        [
          unit.code,
          unit.kind,
          JSON.stringify(unit.name),
          JSON.stringify(unit.abbreviation),
          unit.allowsDecimal,
        ],
      );
      inserted += result.rowCount ?? 0;
    }
    for (const conversion of SEED_UNIT_CONVERSIONS) {
      // Admin ters yönü kaydettiyse eklenmez (K3: tek yön).
      const result = await client.query(
        `insert into unit_conversions (from_code, to_code, factor)
         select $1, $2, $3::numeric
          where not exists (
            select 1 from unit_conversions where from_code = $2 and to_code = $1)
         on conflict (from_code, to_code) do nothing`,
        [conversion.fromCode, conversion.toCode, conversion.factor],
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
