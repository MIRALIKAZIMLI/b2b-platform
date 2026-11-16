// catalog başlangıç verisi (F3.1): birimler ve dönüşümler; F3.2a: kategoriler. `pnpm db:seed`
// çalıştırır; idempotendir. migrator rolüyle, tek işlemde ve platform bağlamında yazar (G tablosu
// yazma politikası). Var olan kod / çift / kategori atlanır (adminin düzenlemesi ezilmez).
import { SEED_CATEGORIES, type SeedCategory } from './seed/categories';
import { SEED_UNIT_CONVERSIONS, SEED_UNITS } from './seed/units';

/** pg `Client` / `PoolClient` uyar (modüller pg'yi içe aktarmaz; bağlantıyı cli.ts açar). */
export interface SeedClient {
  query(text: string, params?: unknown[]): Promise<{ rowCount: number | null; rows: unknown[] }>;
}

export interface CatalogSeedResult {
  /** Bu çalıştırmada eklenen satır sayısı. */
  readonly inserted: number;
}

/**
 * Kategori düğümü: aynı üst altında az, ru veya tr adlarından biri eşleşen kayıt varsa onu kullanır
 * (admin bir dilde adı düzeltse de yeniden eklenmez), yoksa ekler. Dönen: kimlik + eklendi mi.
 */
async function ensureCategory(
  client: SeedClient,
  parentId: string | null,
  name: SeedCategory['name'],
  sortOrder: number,
): Promise<{ id: string; inserted: boolean }> {
  const existing = await client.query(
    `select id from categories
      where parent_id is not distinct from $1::uuid
        and (name->>'az' = $2 or name->>'ru' = $3 or name->>'tr' = $4)
      order by created_at limit 1`,
    [parentId, name.az, name.ru, name.tr],
  );
  const found = existing.rows[0] as { id: string } | undefined;
  if (found !== undefined) return { id: found.id, inserted: false };
  const created = await client.query(
    `insert into categories (parent_id, name, depth, sort_order, is_active)
     values ($1::uuid, $2::jsonb, 1, $3, true) returning id`,
    [parentId, JSON.stringify(name), sortOrder],
  );
  const row = created.rows[0] as { id: string } | undefined;
  if (row === undefined) throw new Error('kategori eklenemedi');
  return { id: row.id, inserted: true };
}

/** F3.2a: onaylı başlangıç kategorileri (8 üst, 43 alt). */
async function seedCategories(client: SeedClient): Promise<number> {
  let inserted = 0;
  for (const [index, top] of SEED_CATEGORIES.entries()) {
    const parent = await ensureCategory(client, null, top.name, (index + 1) * 10);
    if (parent.inserted) inserted += 1;
    for (const [childIndex, child] of top.children.entries()) {
      const node = await ensureCategory(client, parent.id, child, (childIndex + 1) * 10);
      if (node.inserted) inserted += 1;
    }
  }
  return inserted;
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
    inserted += await seedCategories(client);
    await client.query('commit');
    return { inserted };
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}
