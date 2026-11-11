// Bildirim şablonları başlangıç verisi (F1.11). `pnpm db:seed` çalıştırır; idempotendir.
// Altyapı test olayı (`test`) ve gerçek olayların şablonları (kendi adımlarında eklenir).
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
  // F2.9 (US-012 AC2). Taslak çeviri (AI); kullanıcı onayı bekliyor.
  role_template_version: {
    az: {
      title: 'Rol şablonunun yeni versiyası',
      body: 'Platform rol şablonunu yenilədi (versiya {version}). Mövcud rollarınız dəyişməyib; istəsəniz Komanda bölməsində yeni versiyadan rol yarada bilərsiniz.',
    },
    ru: {
      title: 'Новая версия шаблона роли',
      body: 'Платформа обновила шаблон роли (версия {version}). Ваши роли не изменились; при желании создайте роль из новой версии в разделе «Команда».',
    },
    tr: {
      title: 'Rol şablonunun yeni sürümü',
      body: 'Platform bir rol şablonunu güncelledi (sürüm {version}). Mevcut rolleriniz değişmedi; isterseniz Ekip bölümünde yeni sürümden rol açabilirsiniz.',
    },
  },
  // F2.12a (US-021 AC1). Taslak çeviri (AI); kullanıcı onayı bekliyor.
  connection_request: {
    az: {
      title: 'Yeni əlaqə sorğusu',
      body: 'Bir topdançı sizə əlaqə sorğusu göndərdi. Sorğuya baxıb cavab verə bilərsiniz.',
    },
    ru: {
      title: 'Новый запрос на связь',
      body: 'Оптовик отправил вам запрос на связь. Откройте запрос, чтобы ответить.',
    },
    tr: {
      title: 'Yeni bağlantı isteği',
      body: 'Bir toptancı size bağlantı isteği gönderdi. İsteği açıp yanıtlayabilirsiniz.',
    },
  },
  // F2.13a (US-023 AC2–AC4, US-054). Taslak çeviri (AI); kullanıcı onayı bekliyor.
  connection_accepted: {
    az: {
      title: 'Əlaqə sorğusu qəbul edildi',
      body: 'Pərakəndəçi əlaqə sorğunuzu qəbul etdi. İndi müştəri kimi əlaqəniz aktivdir.',
    },
    ru: {
      title: 'Запрос на связь принят',
      body: 'Розничный покупатель принял ваш запрос на связь. Связь с клиентом активна.',
    },
    tr: {
      title: 'Bağlantı isteği kabul edildi',
      body: 'Perakendeci bağlantı isteğinizi kabul etti. Müşteri bağlantınız artık aktif.',
    },
  },
  connection_rejected: {
    az: {
      title: 'Əlaqə sorğusu rədd edildi',
      body: 'Pərakəndəçi əlaqə sorğunuzu rədd etdi.',
    },
    ru: {
      title: 'Запрос на связь отклонён',
      body: 'Розничный покупатель отклонил ваш запрос на связь.',
    },
    tr: {
      title: 'Bağlantı isteği reddedildi',
      body: 'Perakendeci bağlantı isteğinizi reddetti.',
    },
  },
  // F2.16 (US-026 AC1). Taslak çeviri (AI); kullanıcı onayı bekliyor.
  connection_request_expired: {
    az: {
      title: 'Əlaqə sorğusunun müddəti bitdi',
      body: 'Pərakəndəçi əlaqə sorğunuza vaxtında cavab vermədi. İstəsəniz yeni sorğu göndərə bilərsiniz.',
    },
    ru: {
      title: 'Срок запроса на связь истёк',
      body: 'Розничный покупатель не ответил на ваш запрос вовремя. При желании отправьте новый запрос.',
    },
    tr: {
      title: 'Bağlantı isteğinin süresi doldu',
      body: 'Perakendeci bağlantı isteğinizi süresi içinde yanıtlamadı. İsterseniz yeni istek gönderebilirsiniz.',
    },
  },
  // F2.15a: iptal eden işletmenin adı ve gerekçesi yok (engel de aynı metin; Mimar notu 3).
  connection_cancelled: {
    az: {
      title: 'Əlaqə ləğv edildi',
      body: 'Qarşı tərəf sizinlə əlaqəni ləğv etdi. Ətraflı məlumat tətbiqdədir.',
    },
    ru: {
      title: 'Связь отменена',
      body: 'Другая сторона отменила связь с вами. Подробности в приложении.',
    },
    tr: {
      title: 'Bağlantı iptal edildi',
      body: 'Karşı taraf sizinle bağlantıyı iptal etti. Ayrıntılar uygulamada.',
    },
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
