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
  // F2.18 (US-016 AC2, D2 = A): perakendecinin hesabı platformca kapatıldı; toptancı adminlerine.
  // Taslak çeviri (AI); kullanıcı onayı bekliyor.
  connection_closed_by_platform: {
    az: {
      title: 'Əlaqə sona çatdı',
      body: 'Pərakəndəçinin hesabı bağlandığı üçün əlaqə sona çatdı. Ətraflı məlumat tətbiqdədir.',
    },
    ru: {
      title: 'Связь завершена',
      body: 'Связь завершена, так как аккаунт розничного покупателя закрыт. Подробности в приложении.',
    },
    tr: {
      title: 'Bağlantı sona erdi',
      body: 'Perakendecinin hesabı kapatıldığı için bağlantı sona erdi. Ayrıntılar uygulamada.',
    },
  },
  // F2.17 (US-027 AC1–AC2): bağlantısız hesap. Taslak çeviri (AI); kullanıcı onayı bekliyor.
  dormant_profile_reminder: {
    az: {
      title: 'Profilinizi tamamlayın',
      body: 'Hələ heç bir topdançı ilə əlaqəniz yoxdur. Profilinizi tamamlayın ki, bölgənizdəki topdançılar sizi tapsın.',
    },
    ru: {
      title: 'Заполните профиль',
      body: 'У вас пока нет связи ни с одним оптовиком. Заполните профиль, чтобы оптовики вашего региона могли вас найти.',
    },
    tr: {
      title: 'Profilinizi tamamlayın',
      body: 'Henüz hiçbir toptancıyla bağlantınız yok. Bölgenizdeki toptancılar sizi bulabilsin diye profilinizi tamamlayın.',
    },
  },
  new_buyer_in_region: {
    az: {
      title: 'Bölgənizdə yeni pərakəndəçi',
      body: 'Xidmət bölgənizdə hələ heç bir topdançı ilə əlaqəsi olmayan pərakəndəçi var. Kataloqda baxıb əlaqə sorğusu göndərə bilərsiniz.',
    },
    ru: {
      title: 'Новый розничный покупатель в вашем регионе',
      body: 'В вашем регионе обслуживания есть розничный покупатель без связей с оптовиками. Посмотрите каталог и отправьте запрос на связь.',
    },
    tr: {
      title: 'Bölgenizde yeni perakendeci',
      body: 'Hizmet bölgenizde henüz hiçbir toptancıyla bağlantısı olmayan bir perakendeci var. Dizine bakıp bağlantı isteği gönderebilirsiniz.',
    },
  },
  dormant_warning: {
    az: {
      title: 'Hesabınız passivləşəcək',
      body: 'Hesabınız {days} gün sonra passivləşəcək. Bunun qarşısını almaq üçün tətbiqə daxil olun.',
    },
    ru: {
      title: 'Аккаунт станет неактивным',
      body: 'Ваш аккаунт станет неактивным через {days} дн. Чтобы этого не произошло, войдите в приложение.',
    },
    tr: {
      title: 'Hesabınız pasifleşecek',
      body: 'Hesabınız {days} gün sonra pasifleşecek. Bunu önlemek için uygulamaya giriş yapın.',
    },
  },
  // F2.18 (US-015 AC2): VÖEN reddi. Metin gerekçe koduna göre `voen_rejected.<reason>`; kodsuz
  // eski kayıt veya bilinmeyen kodda genel metin. Taslak çeviri (AI); kullanıcı onayı bekliyor.
  voen_rejected: {
    az: {
      title: 'VÖEN təsdiqlənmədi',
      body: 'Daxil etdiyiniz VÖEN yoxlamadan keçmədi və profildən silindi. Profil bölməsində düzgün VÖEN daxil edin.',
    },
    ru: {
      title: 'ИНН (VÖEN) не подтверждён',
      body: 'Указанный VÖEN не прошёл проверку и удалён из профиля. Укажите правильный VÖEN в разделе «Профиль».',
    },
    tr: {
      title: 'VÖEN doğrulanmadı',
      body: 'Girdiğiniz VÖEN doğrulamadan geçmedi ve profilden silindi. Profil bölümünde doğru VÖEN girin.',
    },
  },
  'voen_rejected.voen_not_found': {
    az: {
      title: 'VÖEN təsdiqlənmədi',
      body: 'Daxil etdiyiniz VÖEN vergi sistemində tapılmadı və profildən silindi. Profil bölməsində düzgün VÖEN daxil edin.',
    },
    ru: {
      title: 'ИНН (VÖEN) не подтверждён',
      body: 'Указанный VÖEN не найден в налоговой системе и удалён из профиля. Укажите правильный VÖEN в разделе «Профиль».',
    },
    tr: {
      title: 'VÖEN doğrulanmadı',
      body: 'Girdiğiniz VÖEN vergi sisteminde bulunamadı ve profilden silindi. Profil bölümünde doğru VÖEN girin.',
    },
  },
  'voen_rejected.name_mismatch': {
    az: {
      title: 'VÖEN təsdiqlənmədi',
      body: 'VÖEN-ə aid ad profildəki adla uyğun gəlmir; VÖEN profildən silindi. Adı və VÖEN-i yoxlayıb yenidən daxil edin.',
    },
    ru: {
      title: 'ИНН (VÖEN) не подтверждён',
      body: 'Название по VÖEN не совпадает с названием в профиле; VÖEN удалён из профиля. Проверьте название и VÖEN и укажите их снова.',
    },
    tr: {
      title: 'VÖEN doğrulanmadı',
      body: "VÖEN'e kayıtlı ad profildeki ünvanla uyuşmuyor; VÖEN profilden silindi. Ünvanı ve VÖEN'i kontrol edip yeniden girin.",
    },
  },
  'voen_rejected.voen_inactive': {
    az: {
      title: 'VÖEN təsdiqlənmədi',
      body: 'Daxil etdiyiniz VÖEN aktiv deyil və profildən silindi. Aktiv VÖEN-i profil bölməsində daxil edin.',
    },
    ru: {
      title: 'ИНН (VÖEN) не подтверждён',
      body: 'Указанный VÖEN неактивен и удалён из профиля. Укажите действующий VÖEN в разделе «Профиль».',
    },
    tr: {
      title: 'VÖEN doğrulanmadı',
      body: 'Girdiğiniz VÖEN aktif değil ve profilden silindi. Profil bölümünde aktif VÖEN girin.',
    },
  },
  'voen_rejected.other': {
    az: {
      title: 'VÖEN təsdiqlənmədi',
      body: 'Daxil etdiyiniz VÖEN yoxlamadan keçmədi və profildən silindi. Profil bölməsində düzgün VÖEN daxil edin.',
    },
    ru: {
      title: 'ИНН (VÖEN) не подтверждён',
      body: 'Указанный VÖEN не прошёл проверку и удалён из профиля. Укажите правильный VÖEN в разделе «Профиль».',
    },
    tr: {
      title: 'VÖEN doğrulanmadı',
      body: 'Girdiğiniz VÖEN doğrulamadan geçmedi ve profilden silindi. Profil bölümünde doğru VÖEN girin.',
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
  // F3.2a (US-029 AC2, K5): marka talebi kararı; marka adı bildirime girmez (serbest metin).
  // Taslak çeviri (AI); kullanıcı onayı bekliyor.
  brand_request_approved: {
    az: {
      title: 'Brend sorğusu təsdiqləndi',
      body: 'Göndərdiyiniz brend sorğusu təsdiqləndi. Brendi artıq məhsullarda seçə bilərsiniz.',
    },
    ru: {
      title: 'Запрос бренда одобрен',
      body: 'Ваш запрос на добавление бренда одобрен. Теперь бренд можно выбрать в товарах.',
    },
    tr: {
      title: 'Marka talebi onaylandı',
      body: 'Gönderdiğiniz marka talebi onaylandı. Markayı artık ürünlerde seçebilirsiniz.',
    },
  },
  brand_request_rejected: {
    az: {
      title: 'Brend sorğusu rədd edildi',
      body: 'Göndərdiyiniz brend sorğusu rədd edildi. Ətraflı məlumat tətbiqdədir.',
    },
    ru: {
      title: 'Запрос бренда отклонён',
      body: 'Ваш запрос на добавление бренда отклонён. Подробности в приложении.',
    },
    tr: {
      title: 'Marka talebi reddedildi',
      body: 'Gönderdiğiniz marka talebi reddedildi. Ayrıntılar uygulamada.',
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
