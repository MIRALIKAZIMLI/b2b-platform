// Çok dilli içerik (ADR-0007, data-model §1): `{"az": …, "ru": …, "tr": …, "en": …}`.
// Okumada geri dönüş: istenen dil → işletmenin varsayılan dili → az → dil sırasına göre ilk dolu.
import { z } from 'zod';

/** openapi.yaml `LanguageCode`; sıra geri dönüşte "ilk dolu dil" sırasıdır. */
export const LANGUAGE_CODES = ['az', 'ru', 'tr', 'en'] as const;
export type LanguageCode = (typeof LANGUAGE_CODES)[number];

/** Platformun varsayılan dili (US-058 AC3). Veritabanında `languages.is_default`. */
export const DEFAULT_LANGUAGE: LanguageCode = 'az';

const LANGUAGE_CODE_SET: ReadonlySet<string> = new Set(LANGUAGE_CODES);

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === 'string' && LANGUAGE_CODE_SET.has(value);
}

/** openapi.yaml `LocalizedText`: bilinen dillerde metin, en az bir alan. */
export const localizedTextSchema = z
  .strictObject({
    az: z.string().optional(),
    ru: z.string().optional(),
    tr: z.string().optional(),
    en: z.string().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'En az bir dil gerekli' });

export type LocalizedText = z.infer<typeof localizedTextSchema>;

export interface PickLocalizedOptions {
  /** İşletmenin varsayılan dili (ADR-0007 geri dönüş sırası 2). */
  readonly businessDefault?: string;
}

function filled(text: LocalizedText, lang: string): string | undefined {
  if (!isLanguageCode(lang)) return undefined;
  const value = text[lang];
  return value !== undefined && value.trim() !== '' ? value : undefined;
}

/**
 * Metnin gösterilecek değeri. Boş veya yalnızca boşluk olan değer eksik sayılır.
 * Hiç dolu dil yoksa undefined.
 */
export function pickLocalizedText(
  text: LocalizedText,
  lang: string,
  options: PickLocalizedOptions = {},
): string | undefined {
  const order = [lang, options.businessDefault, DEFAULT_LANGUAGE, ...LANGUAGE_CODES];
  for (const candidate of order) {
    if (candidate === undefined) continue;
    const value = filled(text, candidate);
    if (value !== undefined) return value;
  }
  return undefined;
}
