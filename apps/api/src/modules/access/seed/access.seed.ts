// Erişim başlangıç verisi (F1.8a, data-model §4.5). `pnpm db:seed` çalıştırır; idempotendir.
// - migrator rolüyle, tek işlemde ve platform bağlamında yazar (G tabloları FORCE RLS).
// - permissions: kaynak `@b2b/shared` permissions.ts; yetenek ve modül her çalıştırmada koddan
//   güncellenir (kod tek kaynak). Açıklama metni yok (arayüz `permissions.<kod>` çeviri anahtarını
//   kullanır, F2).
// - role_templates, role_template_permissions, job_titles: ON CONFLICT DO NOTHING; adminin sonradan
//   yaptığı düzenlemeler ezilmez.
import { PERMISSION_CODES, PERMISSIONS, permissionModule } from '@b2b/shared';
import { assertTemplateConsistent, SEED_ROLE_TEMPLATES } from './role-templates';

/** pg `Client` / `PoolClient` uyar (bağlantıyı cli.ts açar). */
export interface SeedClient {
  query(
    text: string,
    params?: unknown[],
  ): Promise<{ rowCount: number | null; rows: Record<string, unknown>[] }>;
}

export interface AccessSeedResult {
  /** Bu çalıştırmada eklenen satır sayısı (var olanlar sayılmaz). */
  readonly inserted: number;
}

async function insertAll(client: SeedClient, newId: () => string): Promise<number> {
  let inserted = 0;
  for (const code of PERMISSION_CODES) {
    const result = await client.query(
      `insert into permissions (code, capability, module)
       values ($1, $2, $3)
       on conflict (code) do update
         set capability = excluded.capability, module = excluded.module
       returning (xmax = 0) as inserted`,
      [code, PERMISSIONS[code].capability, permissionModule(code)],
    );
    if (result.rows[0]?.inserted === true) inserted += 1;
  }
  for (const template of SEED_ROLE_TEMPLATES) {
    assertTemplateConsistent(template);
    const created = await client.query(
      `insert into role_templates (id, code, name, capability, is_business_admin)
       values ($1, $2, $3::jsonb, $4, $5)
       on conflict (code) do nothing`,
      [
        newId(),
        template.code,
        JSON.stringify(template.name),
        template.capability,
        template.isBusinessAdmin,
      ],
    );
    inserted += created.rowCount ?? 0;
    // Şablon yeni açıldıysa izinleri yazılır; var olan şablonun izinlerine dokunulmaz.
    if ((created.rowCount ?? 0) > 0) {
      for (const [code, scope] of Object.entries(template.permissions)) {
        const result = await client.query(
          `insert into role_template_permissions (template_id, permission_code, default_scope)
           select id, $2, $3 from role_templates where code = $1
           on conflict do nothing`,
          [template.code, code, scope],
        );
        inserted += result.rowCount ?? 0;
      }
    }
    const title = await client.query(
      `insert into job_titles (id, code, name, capability, role_template_id)
       select $1, $2, $3::jsonb, $4, id from role_templates where code = $2
       on conflict (code) do nothing`,
      [newId(), template.code, JSON.stringify(template.name), template.capability],
    );
    inserted += title.rowCount ?? 0;
  }
  return inserted;
}

/** Seed'i tek işlemde uygular; hata olursa hiçbir satır yazılmaz. `newId` UUIDv7 üretir. */
export async function seedAccess(
  client: SeedClient,
  newId: () => string,
): Promise<AccessSeedResult> {
  await client.query('begin');
  try {
    await client.query("select set_config('app.is_platform', 'true', true)");
    const inserted = await insertAll(client, newId);
    await client.query('commit');
    return { inserted };
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}
