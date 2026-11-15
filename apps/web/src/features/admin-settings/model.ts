// Ayar ekranının saf kuralları (F2.19, US-017). Taslak metni değere çevirir, değeri metne
// döker, listeyi süzer. Doğrulama `@b2b/shared` kaydıyla (`parseSettingValue`) API ile aynıdır;
// asıl kontrol API'dedir (`SettingsService.set`).
import {
  isSettingKey,
  parseSettingValue,
  type SettingKind,
  type SettingScope,
  settingGroupOf,
} from '@b2b/shared';

export interface SettingItemLike {
  readonly key: string;
  readonly kind: SettingKind;
  readonly scopes: readonly SettingScope[];
}

/** Değeri düzenleyici metnine çevirir (liste → "7, 30"; evet/hayır → "true"/"false"). */
export function draftOf(kind: SettingKind, value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(String).join(', ');
  if (kind === 'bool') return value === true ? 'true' : 'false';
  return typeof value === 'number' || typeof value === 'string' ? String(value) : '';
}

function splitList(text: string): string[] {
  return text
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** Tamsayı metni; ondalık, boşluk veya harf varsa NaN (yanlış tip API'ye gitmez). */
function intOf(text: string): number {
  return /^-?\d+$/.test(text.trim()) ? Number(text.trim()) : Number.NaN;
}

/** Düzenleyici metninden API'ye gidecek ham değer (tip dönüşümü; sınır `checkDraft`'ta). */
export function rawValueOf(kind: SettingKind, text: string): unknown {
  switch (kind) {
    case 'int':
      return intOf(text);
    case 'int_list':
      return splitList(text).map(intOf);
    case 'bool':
      return text === 'true';
    case 'country_codes':
      return splitList(text);
    default:
      return text.trim();
  }
}

export type DraftCheck = { readonly ok: true; readonly value: unknown } | { readonly ok: false };

/** Taslak geçerli mi? (US-017 AC3: ör. bekleme süresi 7'den küçükse kaydet düğmesi hata gösterir) */
export function checkDraft(key: string, kind: SettingKind, text: string): DraftCheck {
  if (!isSettingKey(key)) return { ok: false };
  const parsed = parseSettingValue(key, rawValueOf(kind, text));
  return parsed.ok ? { ok: true, value: parsed.value } : { ok: false };
}

/** Kapsamda gösterilecek satırlar: kapsamı desteklemeyen anahtar gizlenir; arama ad ve anahtarda. */
export function visibleItems<T extends SettingItemLike>(
  items: readonly T[],
  scope: SettingScope,
  query: string,
  labelOf: (key: string) => string,
): T[] {
  const needle = query.trim().toLocaleLowerCase();
  return items.filter(
    (item) =>
      item.scopes.includes(scope) &&
      (needle === '' ||
        item.key.toLocaleLowerCase().includes(needle) ||
        labelOf(item.key).toLocaleLowerCase().includes(needle)),
  );
}

/** Satırları kayıt sırasını koruyarak gruplar (`connection`, `otp`…). */
export function groupItems<T extends SettingItemLike>(items: readonly T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const group = isSettingKey(item.key) ? settingGroupOf(item.key) : 'other';
    groups.set(group, [...(groups.get(group) ?? []), item]);
  }
  return [...groups];
}
