// Dillerin ve arayüz çevirilerinin bellekteki anlık görüntüsü (F1.3). Veritabanından tek
// sorguyla yüklenir; /i18n uç noktası ve hata mesajları buradan okunur.
import { createHash } from 'node:crypto';
import { DEFAULT_LANGUAGE } from '@b2b/shared';

/** `languages` satırı ve o dildeki `ui_translations` değerleri. */
export interface LanguageRow {
  readonly code: string;
  readonly isActive: boolean;
  readonly isDefault: boolean;
  readonly sortOrder: number;
  readonly values: Readonly<Record<string, string>>;
}

export interface Dictionary {
  /** Anahtar → metin; dilde eksik anahtar varsayılan dilin değeriyle (US-058 AC3). */
  readonly values: Readonly<Record<string, string>>;
  /** Güçlü ETag (`"…"`); içerik ve dil aynıysa her süreçte aynı (F1.3-AC9). */
  readonly etag: string;
}

/** Sözlüğün özeti: anahtarlar sıralı JSON'un SHA-256'sı (base64url). */
function etagOf(lang: string, values: Readonly<Record<string, string>>): string {
  const sorted = Object.keys(values)
    .sort()
    .map((key) => [key, values[key]]);
  const digest = createHash('sha256')
    .update(JSON.stringify([lang, sorted]))
    .digest('base64url');
  return `"${digest}"`;
}

export class I18nSnapshot {
  private readonly dictionaries = new Map<string, Dictionary>();

  private constructor(
    readonly defaultLanguage: string,
    private readonly rows: ReadonlyMap<string, LanguageRow>,
  ) {}

  static build(rows: readonly LanguageRow[]): I18nSnapshot {
    const byCode = new Map(rows.map((row) => [row.code, row]));
    const defaultRow = rows.find((row) => row.isDefault);
    return new I18nSnapshot(defaultRow?.code ?? DEFAULT_LANGUAGE, byCode);
  }

  isActive(lang: string): boolean {
    return this.rows.get(lang)?.isActive === true;
  }

  /** Aktif dilin sözlüğü; pasif veya bilinmeyen dil için undefined (US-058 AC4). */
  dictionary(lang: string): Dictionary | undefined {
    if (!this.isActive(lang)) return undefined;
    const cached = this.dictionaries.get(lang);
    if (cached !== undefined) return cached;
    const values = {
      ...this.rows.get(this.defaultLanguage)?.values,
      ...this.rows.get(lang)?.values,
    };
    const dictionary: Dictionary = { values, etag: etagOf(lang, values) };
    this.dictionaries.set(lang, dictionary);
    return dictionary;
  }

  /** Adaylardan ilk aktif dil; yoksa varsayılan dil. */
  pickLanguage(candidates: readonly string[]): string {
    return candidates.find((lang) => this.isActive(lang)) ?? this.defaultLanguage;
  }

  /** Anahtarın dildeki değeri; yoksa varsayılan dildeki; o da yoksa undefined. */
  translate(key: string, lang: string): string | undefined {
    return this.rows.get(lang)?.values[key] ?? this.rows.get(this.defaultLanguage)?.values[key];
  }
}

/** `If-None-Match` başlığı ETag ile eşleşiyor mu (zayıf karşılaştırma, `*` dahil). */
export function matchesIfNoneMatch(header: string | undefined, etag: string): boolean {
  if (header === undefined || header.trim() === '') return false;
  return header
    .split(',')
    .map((tag) => tag.trim())
    .some((tag) => tag === '*' || tag.replace(/^W\//, '') === etag);
}
