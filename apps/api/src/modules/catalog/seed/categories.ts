// Başlangıç kategorileri (F3.2a; onaylı liste docs/tasks/F3-seed-listeleri.md, S1 = A). İki seviye:
// 8 üst, 43 alt. az adları platform sahibince onaylı; ru, tr, en Mimar taslağı. Liste değişirse önce
// belge, sonra bu dosya. Sıra (`sort_order`) listedeki sıradır (10'ar artar).
interface SeedText {
  readonly az: string;
  readonly ru: string;
  readonly tr: string;
  readonly en: string;
}

export interface SeedCategory {
  readonly name: SeedText;
  readonly children: readonly SeedText[];
}

const t = (az: string, ru: string, tr: string, en: string): SeedText => ({ az, ru, tr, en });

export const SEED_CATEGORIES: readonly SeedCategory[] = [
  {
    name: t('Saç baxımı', 'Уход за волосами', 'Saç bakımı', 'Hair care'),
    children: [
      t('Şampun', 'Шампунь', 'Şampuan', 'Shampoo'),
      t(
        'Saç kondisioneri və balzam',
        'Кондиционер и бальзам',
        'Saç kremi ve balsam',
        'Conditioner and balm',
      ),
      t('Saç maskası', 'Маска для волос', 'Saç maskesi', 'Hair mask'),
      t(
        'Saç yağı və serum',
        'Масло и сыворотка для волос',
        'Saç yağı ve serum',
        'Hair oil and serum',
      ),
      t('Saç boyası', 'Краска для волос', 'Saç boyası', 'Hair colour'),
      t(
        'Saç formalaşdırma (lak, gel, köpük)',
        'Укладка (лак, гель, мусс)',
        'Saç şekillendirme (sprey, jöle, köpük)',
        'Hair styling',
      ),
      t(
        'Saç tökülməsinə qarşı',
        'Против выпадения волос',
        'Saç dökülmesine karşı',
        'Anti hair loss',
      ),
    ],
  },
  {
    name: t('Üz baxımı', 'Уход за лицом', 'Yüz bakımı', 'Face care'),
    children: [
      t('Üz kremi', 'Крем для лица', 'Yüz kremi', 'Face cream'),
      t('Üz təmizləyici', 'Очищение лица', 'Yüz temizleyici', 'Face cleanser'),
      t(
        'Tonik və mitselyar su',
        'Тоник и мицеллярная вода',
        'Tonik ve misel su',
        'Toner and micellar water',
      ),
      t('Üz maskası', 'Маска для лица', 'Yüz maskesi', 'Face mask'),
      t('Üz serumu', 'Сыворотка для лица', 'Yüz serumu', 'Face serum'),
      t('Göz ətrafı baxımı', 'Уход за кожей вокруг глаз', 'Göz çevresi bakımı', 'Eye care'),
      t('Dodaq baxımı', 'Уход за губами', 'Dudak bakımı', 'Lip care'),
    ],
  },
  {
    name: t('Bədən baxımı', 'Уход за телом', 'Vücut bakımı', 'Body care'),
    children: [
      t('Duş geli və sabun', 'Гель для душа и мыло', 'Duş jeli ve sabun', 'Shower gel and soap'),
      t(
        'Bədən losyonu və krem',
        'Лосьон и крем для тела',
        'Vücut losyonu ve kremi',
        'Body lotion and cream',
      ),
      t('Əl və ayaq baxımı', 'Уход за руками и ногами', 'El ve ayak bakımı', 'Hand and foot care'),
      t('Dezodorant', 'Дезодорант', 'Deodorant', 'Deodorant'),
      t('Günəşdən qoruyucu', 'Солнцезащитные средства', 'Güneş koruyucu', 'Sun care'),
      t('Epilyasiya və depilyasiya', 'Эпиляция и депиляция', 'Epilasyon ve ağda', 'Hair removal'),
    ],
  },
  {
    name: t('Makiyaj', 'Макияж', 'Makyaj', 'Make-up'),
    children: [
      t(
        'Üz makiyajı (tonal krem, pudra)',
        'Макияж для лица (тональный крем, пудра)',
        'Yüz makyajı (fondöten, pudra)',
        'Face make-up',
      ),
      t(
        'Göz makiyajı (tuş, qələm, kölgə)',
        'Макияж для глаз (тушь, карандаш, тени)',
        'Göz makyajı (maskara, kalem, far)',
        'Eye make-up',
      ),
      t(
        'Dodaq makiyajı (pomada, parıldadıcı)',
        'Макияж для губ (помада, блеск)',
        'Dudak makyajı (ruj, parlatıcı)',
        'Lip make-up',
      ),
      t('Qaş məhsulları', 'Средства для бровей', 'Kaş ürünleri', 'Brow products'),
      t(
        'Makiyaj təmizləyici',
        'Средства для снятия макияжа',
        'Makyaj temizleyici',
        'Make-up remover',
      ),
      t('Fırça və süngər', 'Кисти и спонжи', 'Fırça ve sünger', 'Brushes and sponges'),
    ],
  },
  {
    name: t('Dırnaq baxımı', 'Уход за ногтями', 'Tırnak bakımı', 'Nail care'),
    children: [
      t('Dırnaq lakı', 'Лак для ногтей', 'Oje', 'Nail polish'),
      t(
        'Gel lak və ləvazimat',
        'Гель-лак и материалы',
        'Kalıcı oje ve malzemeleri',
        'Gel polish and supplies',
      ),
      t('Lak təmizləyici', 'Жидкость для снятия лака', 'Aseton', 'Nail polish remover'),
      t('Manikür alətləri', 'Инструменты для маникюра', 'Manikür aletleri', 'Manicure tools'),
    ],
  },
  {
    name: t('Ətriyyat', 'Парфюмерия', 'Parfüm', 'Fragrance'),
    children: [
      t('Qadın ətri', 'Женская парфюмерия', 'Kadın parfümü', "Women's fragrance"),
      t('Kişi ətri', 'Мужская парфюмерия', 'Erkek parfümü', "Men's fragrance"),
      t('Bədən spreyi', 'Спрей для тела', 'Vücut spreyi', 'Body spray'),
    ],
  },
  {
    name: t('Kişi baxımı', 'Мужской уход', 'Erkek bakımı', "Men's grooming"),
    children: [
      t('Təraş məhsulları', 'Средства для бритья', 'Tıraş ürünleri', 'Shaving products'),
      t('Saqqal baxımı', 'Уход за бородой', 'Sakal bakımı', 'Beard care'),
      t(
        'Kişi saç və bədən baxımı',
        'Мужской уход за волосами и телом',
        'Erkek saç ve vücut bakımı',
        "Men's hair and body care",
      ),
    ],
  },
  {
    name: t(
      'Gigiyena və aksesuar',
      'Гигиена и аксессуары',
      'Hijyen ve aksesuar',
      'Hygiene and accessories',
    ),
    children: [
      t('Ağız baxımı', 'Уход за полостью рта', 'Ağız bakımı', 'Oral care'),
      t('Qadın gigiyenası', 'Женская гигиена', 'Kadın hijyeni', 'Feminine hygiene'),
      t('Pambıq və salfet', 'Вата и салфетки', 'Pamuk ve mendil', 'Cotton and wipes'),
      t(
        'Daraq və saç aksesuarı',
        'Расчёски и аксессуары для волос',
        'Tarak ve saç aksesuarı',
        'Combs and hair accessories',
      ),
      t(
        'Salon və peşəkar ləvazimat',
        'Салонные и профессиональные материалы',
        'Salon ve profesyonel malzeme',
        'Salon and professional supplies',
      ),
      t('Uşaq baxımı', 'Детский уход', 'Bebek ve çocuk bakımı', 'Baby and child care'),
      t('Hədiyyə dəstləri', 'Подарочные наборы', 'Hediye setleri', 'Gift sets'),
    ],
  },
];
