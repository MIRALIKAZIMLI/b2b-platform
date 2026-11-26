// Web fiyat ekranlarının saf yardımcıları (F3.6b; US-034 AC1, AC5, AC6). Ekranlar yalnız bunları
// çağırır; para metin olarak taşınır (hesap yok), doğrulama API şemasıyla aynı desenler.
import {
  PRICE_LIST_NAME_MAX,
  type PriceListStatus,
  type PriceSource,
  UNIT_PRICE_PATTERN,
  VAT_RATE_PATTERN,
} from './pricing';

export interface PricingAccess {
  readonly view: boolean;
  readonly manage: boolean;
}

export function pricingAccess(codes: readonly string[]): PricingAccess {
  return { view: codes.includes('pricing.view'), manage: codes.includes('pricing.manage') };
}

/** Ondalık kutusu: boşluklar atılır, virgül noktaya çevrilir (az/ru/tr klavyesi). */
export function normalizeDecimalInput(input: string): string {
  return input.replace(/\s/g, '').replace(',', '.');
}

/** Birim fiyat kutusu → API metni; boş = `empty`, desen dışı = `invalid`. */
export function parseUnitPrice(input: string):
  | { kind: 'empty' }
  | { kind: 'invalid' }
  | {
      kind: 'ok';
      value: string;
    } {
  const value = normalizeDecimalInput(input);
  if (value === '') return { kind: 'empty' };
  return UNIT_PRICE_PATTERN.test(value) ? { kind: 'ok', value } : { kind: 'invalid' };
}

// ---- Liste formu ----

export interface PriceListFormValues {
  readonly name: string;
  readonly currency: string;
  readonly vatIncluded: boolean;
  readonly vatRate: string;
}

export type PriceListFormField = 'name' | 'currency' | 'vatRate';

/** `POST /price-lists` gövdesi (standartlık çağıranın kararı). */
export interface PriceListFormBody {
  readonly name: string;
  readonly currency: string;
  readonly vatIncluded: boolean;
  readonly vatRate: string;
}

/** `PUT /price-lists/{id}/items` gövdesi; `validFrom` yalnız ileri tarihte bulunur. */
export interface PriceItemsBody {
  readonly validFrom?: string;
  readonly items: { packagingId: string; unitPrice: string }[];
}

/** Yeni liste veya düzenleme gövdesi; hatalı alanlar listelenir (istemci, API'den önce). */
export function priceListFormBody(
  values: PriceListFormValues,
):
  | { readonly ok: true; readonly body: PriceListFormBody }
  | { readonly ok: false; readonly invalid: readonly PriceListFormField[] } {
  const name = values.name.trim();
  const currency = values.currency.trim().toUpperCase();
  const vatRate = normalizeDecimalInput(values.vatRate);
  const invalid: PriceListFormField[] = [];
  if (name.length === 0 || name.length > PRICE_LIST_NAME_MAX) invalid.push('name');
  if (!/^[A-Z]{3}$/.test(currency)) invalid.push('currency');
  if (!VAT_RATE_PATTERN.test(vatRate) || Number.parseFloat(vatRate) > 100) invalid.push('vatRate');
  if (invalid.length > 0) return { ok: false, invalid };
  return { ok: true, body: { name, currency, vatIncluded: values.vatIncluded, vatRate } };
}

/** Liste kartındaki eylemler (state-machines §15; K2 = A ve K3 sunucuda da korunur). */
export function priceListActions(
  list: { readonly isDefault: boolean; readonly status: PriceListStatus },
  canManage: boolean,
): {
  readonly canEdit: boolean;
  readonly canMakeDefault: boolean;
  readonly canArchive: boolean;
  readonly canRestore: boolean;
} {
  const active = list.status === 'active';
  return {
    canEdit: canManage && active,
    canMakeDefault: canManage && active && !list.isDefault,
    // Varsayılan liste arşivlenemez (K3): düğme yok, önce başka liste varsayılan yapılır.
    canArchive: canManage && active && !list.isDefault,
    canRestore: canManage && list.status === 'archived',
  };
}

/** Sıra: varsayılan, sonra aktifler ada göre, en sonda arşivliler. */
export function sortPriceLists<
  T extends {
    readonly name: string;
    readonly isDefault: boolean;
    readonly status: PriceListStatus;
  },
>(lists: readonly T[], locale: string): T[] {
  const rank = (list: T) => (list.isDefault ? 0 : list.status === 'active' ? 1 : 2);
  return [...lists].sort(
    (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, locale, { sensitivity: 'base' }),
  );
}

/** Liste eylemi hatası → çeviri anahtarı. */
export function priceListFailureKey(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
      ? error.code
      : 'INTERNAL_ERROR';
  return `errors.${code}`;
}

// ---- Fiyat girişi (ürün formu kartı) ----

export type PriceStartMode = 'now' | 'scheduled';

export interface PriceRowInput {
  readonly packagingId: string;
  readonly input: string;
}

/**
 * `PUT /price-lists/{id}/items` gövdesi: yalnız dolu kutular gönderilir (boş = değişiklik yok).
 * İleri tarihte gün zorunlu (`YYYY-MM-DD`); "bugün veya geçmiş" kararını sunucu toptancının saat
 * diliminde verir (422 `validFrom`), istemci yalnız biçimi denetler.
 */
export function priceItemsBody(
  rows: readonly PriceRowInput[],
  mode: PriceStartMode,
  day: string,
):
  | { readonly ok: true; readonly body: PriceItemsBody }
  | {
      readonly ok: false;
      readonly invalidRows: readonly string[];
      readonly invalidDay: boolean;
      readonly empty: boolean;
    } {
  const items: { packagingId: string; unitPrice: string }[] = [];
  const invalidRows: string[] = [];
  for (const row of rows) {
    const parsed = parseUnitPrice(row.input);
    if (parsed.kind === 'invalid') invalidRows.push(row.packagingId);
    if (parsed.kind === 'ok') items.push({ packagingId: row.packagingId, unitPrice: parsed.value });
  }
  const invalidDay = mode === 'scheduled' && !/^\d{4}-\d{2}-\d{2}$/.test(day);
  const empty = items.length === 0 && invalidRows.length === 0;
  if (invalidRows.length > 0 || invalidDay || empty) {
    return { ok: false, invalidRows, invalidDay, empty };
  }
  return { ok: true, body: mode === 'scheduled' ? { validFrom: day, items } : { items } };
}

/** API 422 ayrıntısı → hatalı satırlar ve gün (`items.<i>.packagingId|unitPrice`, `validFrom`). */
export function priceItemsFieldErrors(
  details: unknown,
  sent: readonly { readonly packagingId: string }[],
): { readonly rows: readonly string[]; readonly day: boolean } {
  if (typeof details !== 'object' || details === null) return { rows: [], day: false };
  const rows = new Set<string>();
  for (const key of Object.keys(details)) {
    const match = /^items\.(\d+)\./.exec(key);
    const row = match === null ? undefined : sent[Number(match[1])];
    if (row !== undefined) rows.add(row.packagingId);
  }
  return { rows: [...rows], day: 'validFrom' in details };
}

/** Fiyat kaynağı (US-034 AC5) → çeviri anahtarı. */
export function priceSourceKey(source: PriceSource): string {
  return `prices.source.${source}`;
}

/**
 * Gösterim: API'nin 4 haneli fiyat metni en az 2 ondalıkla, sondaki sıfırlar atılarak
 * (`10.5000` → `10.50`, `10.1250` → `10.125`). Sayıya çevrilmez (para `number` olmaz).
 */
export function formatUnitPrice(amount: string): string {
  const [whole = '0', fraction = ''] = amount.split('.');
  const trimmed = fraction.replace(/0+$/, '');
  return `${whole}.${trimmed.padEnd(2, '0')}`;
}

/** `YYYY-MM-DD` gününe `days` gün ekler (takvim hesabı, saat dilimsiz). */
export function addDays(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  const next = new Date(Date.UTC(year, month - 1, date + days));
  return next.toISOString().slice(0, 10);
}
