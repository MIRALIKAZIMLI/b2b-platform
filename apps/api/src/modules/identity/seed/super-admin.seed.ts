// İlk süper admin (F1.6). `pnpm db:seed` çalıştırır; migrator rolüyle, tek işlemde, platform
// bağlamında (`users` FORCE RLS). SUPER_ADMIN_PHONE yoksa atlar, hata vermez. İdempotent: kullanıcı
// varsa yeniden eklenmez (adı değişmez); platform_staff satırı varsa rolü değişmez.
// Telefon loglanmaz.

/** pg `Client` / `PoolClient` uyar (modüller pg'yi içe aktarmaz; bağlantıyı cli.ts açar). */
export interface SuperAdminSeedClient {
  query(
    text: string,
    params?: unknown[],
  ): Promise<{ rowCount: number | null; rows: Record<string, unknown>[] }>;
}

export type SuperAdminSeedResult =
  | { readonly status: 'skipped' }
  | { readonly status: 'done'; readonly userCreated: boolean; readonly staffCreated: boolean };

const DEFAULT_FULL_NAME = 'Super Admin';

export async function seedSuperAdmin(
  client: SuperAdminSeedClient,
  phone: string | undefined,
  newId: () => string,
): Promise<SuperAdminSeedResult> {
  if (phone === undefined) return { status: 'skipped' };
  await client.query('begin');
  try {
    await client.query("select set_config('app.is_platform', 'true', true)");
    const inserted = await client.query(
      `insert into users (id, phone_e164, full_name) values ($1, $2, $3)
       on conflict (phone_e164) do nothing`,
      [newId(), phone, DEFAULT_FULL_NAME],
    );
    const user = await client.query('select id from users where phone_e164 = $1', [phone]);
    const userId = user.rows[0]?.id;
    if (typeof userId !== 'string') throw new Error('süper admin kullanıcısı bulunamadı');
    const staff = await client.query(
      `insert into platform_staff (user_id, role, is_active) values ($1, 'super_admin', true)
       on conflict (user_id) do nothing`,
      [userId],
    );
    await client.query('commit');
    return {
      status: 'done',
      userCreated: (inserted.rowCount ?? 0) > 0,
      staffCreated: (staff.rowCount ?? 0) > 0,
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}
