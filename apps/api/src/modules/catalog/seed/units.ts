// Başlangıç birimleri (US-028 "Başlangıç verisi"; kart docs/tasks/F3.1.md "Başlangıç listesi").
// Adlar ve kısaltmalar taslak (az/ru/tr onayı bekliyor). Liste değişirse önce kart, sonra bu dosya.
import type { UnitKind } from '@b2b/shared';

interface SeedText {
  readonly az: string;
  readonly ru: string;
  readonly tr: string;
  readonly en: string;
}

export interface SeedUnit {
  readonly code: string;
  readonly kind: UnitKind;
  readonly allowsDecimal: boolean;
  readonly name: SeedText;
  readonly abbreviation: SeedText;
}

const t = (az: string, ru: string, tr: string, en: string): SeedText => ({ az, ru, tr, en });

export const SEED_UNITS: readonly SeedUnit[] = [
  {
    code: 'H87',
    kind: 'count',
    allowsDecimal: false,
    name: t('Ədəd', 'Штука', 'Adet', 'Piece'),
    abbreviation: t('əd.', 'шт.', 'ad.', 'pc'),
  },
  {
    code: 'C62',
    kind: 'count',
    allowsDecimal: false,
    name: t('Vahid', 'Единица', 'Birim', 'Unit'),
    abbreviation: t('vah.', 'ед.', 'brm', 'u'),
  },
  {
    code: 'GRM',
    kind: 'weight',
    allowsDecimal: true,
    name: t('Qram', 'Грамм', 'Gram', 'Gram'),
    abbreviation: t('q', 'г', 'g', 'g'),
  },
  {
    code: 'KGM',
    kind: 'weight',
    allowsDecimal: true,
    name: t('Kiloqram', 'Килограмм', 'Kilogram', 'Kilogram'),
    abbreviation: t('kq', 'кг', 'kg', 'kg'),
  },
  {
    code: 'TNE',
    kind: 'weight',
    allowsDecimal: true,
    name: t('Ton', 'Тонна', 'Ton', 'Tonne'),
    abbreviation: t('t', 'т', 't', 't'),
  },
  {
    code: 'MLT',
    kind: 'volume',
    allowsDecimal: true,
    name: t('Millilitr', 'Миллилитр', 'Mililitre', 'Millilitre'),
    abbreviation: t('ml', 'мл', 'ml', 'ml'),
  },
  {
    code: 'LTR',
    kind: 'volume',
    allowsDecimal: true,
    name: t('Litr', 'Литр', 'Litre', 'Litre'),
    abbreviation: t('l', 'л', 'l', 'l'),
  },
  {
    code: 'MTQ',
    kind: 'volume',
    allowsDecimal: true,
    name: t('Kubmetr', 'Кубический метр', 'Metreküp', 'Cubic metre'),
    abbreviation: t('m³', 'м³', 'm³', 'm³'),
  },
  {
    code: 'CMT',
    kind: 'length',
    allowsDecimal: true,
    name: t('Santimetr', 'Сантиметр', 'Santimetre', 'Centimetre'),
    abbreviation: t('sm', 'см', 'cm', 'cm'),
  },
  {
    code: 'MTR',
    kind: 'length',
    allowsDecimal: true,
    name: t('Metr', 'Метр', 'Metre', 'Metre'),
    abbreviation: t('m', 'м', 'm', 'm'),
  },
  {
    code: 'MTK',
    kind: 'area',
    allowsDecimal: true,
    name: t('Kvadratmetr', 'Квадратный метр', 'Metrekare', 'Square metre'),
    abbreviation: t('m²', 'м²', 'm²', 'm²'),
  },
  {
    code: 'XPK',
    kind: 'package',
    allowsDecimal: false,
    name: t('Paket', 'Пакет', 'Paket', 'Package'),
    abbreviation: t('pak.', 'пак.', 'pkt', 'pk'),
  },
  {
    code: 'XBX',
    kind: 'package',
    allowsDecimal: false,
    name: t('Qutu', 'Коробка', 'Kutu', 'Box'),
    abbreviation: t('qutu', 'кор.', 'kutu', 'box'),
  },
  {
    code: 'XCT',
    kind: 'package',
    allowsDecimal: false,
    name: t('Karton qutu', 'Картонная коробка', 'Koli', 'Carton'),
    abbreviation: t('karton', 'карт.', 'koli', 'ctn'),
  },
  {
    code: 'XBO',
    kind: 'package',
    allowsDecimal: false,
    name: t('Şüşə', 'Бутылка', 'Şişe', 'Bottle'),
    abbreviation: t('şüşə', 'бут.', 'şişe', 'btl'),
  },
  {
    code: 'XCA',
    kind: 'package',
    allowsDecimal: false,
    name: t('Banka', 'Банка', 'Teneke kutu', 'Can'),
    abbreviation: t('banka', 'бан.', 'kutu', 'can'),
  },
  {
    code: 'XBG',
    kind: 'package',
    allowsDecimal: false,
    name: t('Torba', 'Сумка', 'Torba', 'Bag'),
    abbreviation: t('torba', 'сум.', 'torba', 'bag'),
  },
  {
    code: 'XSA',
    kind: 'package',
    allowsDecimal: false,
    name: t('Kisə', 'Мешок', 'Çuval', 'Sack'),
    abbreviation: t('kisə', 'меш.', 'çuval', 'sack'),
  },
  {
    code: 'XPX',
    kind: 'package',
    allowsDecimal: false,
    name: t('Palet', 'Паллета', 'Palet', 'Pallet'),
    abbreviation: t('palet', 'пал.', 'palet', 'plt'),
  },
];

/** `1 from = factor to` (kart F3.1 "Dönüşümler"). */
export const SEED_UNIT_CONVERSIONS: readonly {
  readonly fromCode: string;
  readonly toCode: string;
  readonly factor: string;
}[] = [
  { fromCode: 'KGM', toCode: 'GRM', factor: '1000' },
  { fromCode: 'TNE', toCode: 'KGM', factor: '1000' },
  { fromCode: 'LTR', toCode: 'MLT', factor: '1000' },
  { fromCode: 'MTQ', toCode: 'LTR', factor: '1000' },
  { fromCode: 'MTR', toCode: 'CMT', factor: '100' },
];
