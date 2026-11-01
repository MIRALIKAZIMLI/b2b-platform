// Faaliyet türleri (`activity_types`, F2.3a). Kaynak: docs/tasks/F2-seed-listeleri.md §2 (platform
// sahibi onayı, 2026-10-31; faz spesifikasyonu S5). Liste değişirse önce o belge, sonra bu dosya.
// Sıra = `sort_order`.
export interface SeedActivityTypeName {
  readonly az: string;
  readonly ru: string;
  readonly tr: string;
}

export const PILOT_ACTIVITY_TYPES: readonly SeedActivityTypeName[] = [
  { az: 'Market / ərzaq mağazası', ru: 'Продуктовый магазин', tr: 'Market / bakkal' },
  { az: 'Supermarket', ru: 'Супермаркет', tr: 'Süpermarket' },
  { az: 'Kafe', ru: 'Кафе', tr: 'Kafe' },
  { az: 'Restoran', ru: 'Ресторан', tr: 'Restoran' },
  { az: 'Otel', ru: 'Гостиница', tr: 'Otel' },
  { az: 'Aptek', ru: 'Аптека', tr: 'Eczane' },
  {
    az: 'Kosmetika və gigiyena mağazası',
    ru: 'Магазин косметики и гигиены',
    tr: 'Kozmetik ve hijyen mağazası',
  },
  {
    az: 'Məişət kimyası mağazası',
    ru: 'Магазин бытовой химии',
    tr: 'Temizlik ürünleri mağazası',
  },
  { az: 'Dəftərxana mağazası', ru: 'Канцелярский магазин', tr: 'Kırtasiye' },
  {
    az: 'Tikinti materialları mağazası',
    ru: 'Магазин стройматериалов',
    tr: 'Yapı malzemeleri mağazası',
  },
  { az: 'Digər', ru: 'Другое', tr: 'Diğer' },
];
