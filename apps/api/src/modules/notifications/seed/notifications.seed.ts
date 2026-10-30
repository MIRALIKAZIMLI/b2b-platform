// Bildirim şablonları başlangıç verisi (F1.11). `pnpm db:seed` çalıştırır; idempotendir.
// Yalnızca altyapı test olayının (`test`) şablonu; gerçek olayların şablonları kendi adımlarında.
// migrator rolüyle, tek işlemde ve platform bağlamında yazar (G tablosu FORCE RLS; F1.3 kalıbı).
// ON CONFLICT DO NOTHING: adminin sonradan yaptığı düzenlemeler ezilmez.

/** pg `Client` / `PoolClient` uyar (modüller pg'yi içe aktarmaz; bağlantıyı cli.ts açar). */
export interface SeedClient {
  query(text: string, params?: unknown[]): Promise<{ rowCount: number | null }>;
}

type Lang = 'az' | 'ru' | 'tr';

export const NOTIFICATION_TEMPLATES: Readonly<
  Record<string, Readonly<Record<Lang, { readonly title: string; readonly body: string }>>>
> = {
  test: {
    az: { title: 'Test bildirişi', body: 'Bildiriş sistemi işləyir.' },
    ru: { title: 'Тестовое уведомление', body: 'Система уведомлений работает.' },
    tr: { title: 'Test bildirimi', body: 'Bildirim sistemi çalışıyor.' },
  },
};

export interface NotificationsSeedResult {
  readonly inserted: number;
}

export async function seedNotifications(client: SeedClient): Promise<NotificationsSeedResult> {
  await client.query('begin');
  try {
    await client.query("select set_config('app.is_platform', 'true', true)");
    const types: string[] = [];
    const langs: string[] = [];
    const titles: string[] = [];
    const bodies: string[] = [];
    for (const [type, byLang] of Object.entries(NOTIFICATION_TEMPLATES)) {
      for (const [lang, text] of Object.entries(byLang)) {
        types.push(type);
        langs.push(lang);
        titles.push(text.title);
        bodies.push(text.body);
      }
    }
    const result = await client.query(
      `insert into notification_templates (type, lang, title, body)
       select * from unnest($1::text[], $2::text[], $3::text[], $4::text[])
       on conflict do nothing`,
      [types, langs, titles, bodies],
    );
    await client.query('commit');
    return { inserted: result.rowCount ?? 0 };
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}
