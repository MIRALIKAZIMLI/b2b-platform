// Pilot bölgeler (`regions`, F2.1a). Kaynak: docs/tasks/F2-seed-listeleri.md §1 (platform sahibi
// onayı, 2026-10-31; faz spesifikasyonu S4). Liste değişirse önce o belge, sonra bu dosya.
// Şehir (`city`) → rayon (`district`, üst bölge şehir); ülke `AZ`.
export interface SeedRegionName {
  readonly az: string;
  readonly ru: string;
  readonly tr: string;
}

export interface SeedRegion {
  readonly name: SeedRegionName;
  readonly districts?: readonly SeedRegionName[];
}

export const PILOT_REGIONS: readonly SeedRegion[] = [
  {
    name: { az: 'Bakı', ru: 'Баку', tr: 'Bakü' },
    districts: [
      { az: 'Binəqədi rayonu', ru: 'Бинагадинский район', tr: 'Binegedi rayonu' },
      { az: 'Qaradağ rayonu', ru: 'Гарадагский район', tr: 'Karadağ rayonu' },
      { az: 'Xətai rayonu', ru: 'Хатаинский район', tr: 'Hatai rayonu' },
      { az: 'Xəzər rayonu', ru: 'Хазарский район', tr: 'Hazar rayonu' },
      { az: 'Nərimanov rayonu', ru: 'Наримановский район', tr: 'Nerimanov rayonu' },
      { az: 'Nəsimi rayonu', ru: 'Насиминский район', tr: 'Nesimi rayonu' },
      { az: 'Nizami rayonu', ru: 'Низаминский район', tr: 'Nizami rayonu' },
      { az: 'Pirallahı rayonu', ru: 'Пираллахинский район', tr: 'Pirallahı rayonu' },
      { az: 'Sabunçu rayonu', ru: 'Сабунчинский район', tr: 'Sabunçu rayonu' },
      { az: 'Səbail rayonu', ru: 'Сабаильский район', tr: 'Sebail rayonu' },
      { az: 'Suraxanı rayonu', ru: 'Сураханский район', tr: 'Suraxanı rayonu' },
      { az: 'Yasamal rayonu', ru: 'Ясамальский район', tr: 'Yasamal rayonu' },
    ],
  },
  { name: { az: 'Sumqayıt', ru: 'Сумгайыт', tr: 'Sumgayıt' } },
  { name: { az: 'Xırdalan', ru: 'Хырдалан', tr: 'Hırdalan' } },
  { name: { az: 'Gəncə', ru: 'Гянджа', tr: 'Gence' } },
];
