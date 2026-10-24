// Gösterim biçimlendirmesi (US-059, coding-guidelines §9.4). Web ve mobil tutar ve zamanı
// yalnızca bu fonksiyonlarla gösterir.
// - Para: `Intl.NumberFormat` (CLDR kuralı, Mimar kararı F1.3). Tutar openapi `Decimal` metnidir
//   ve number'a çevrilmeden biçimlendiriciye verilir (kayan nokta hatası olmasın; F1.2a kararı).
//   Hane sayısı ve sembol `currencies` tablosundan gelir.
// - Zaman: date-fns + @date-fns/tz. Saat dilimi zinciri: kullanıcı → işletme → ülke (US-059 AC2).
import { TZDate } from '@date-fns/tz';
import { format as formatDateFns, isValid, type Locale, parseISO } from 'date-fns';
import { az, enUS, ru, tr } from 'date-fns/locale';
import { DEFAULT_LANGUAGE, isLanguageCode, type LanguageCode } from './localized-text';

/** openapi.yaml `Money`. */
export interface MoneyAmount {
  readonly amount: string;
  readonly currency: string;
}

/** `currencies` tablosundaki gösterim bilgisi. */
export interface CurrencyFormat {
  readonly code: string;
  readonly symbol: string;
  readonly decimals: number;
}

/** openapi.yaml `Decimal` şeması. */
const DECIMAL_TEXT = /^-?[0-9]+(\.[0-9]{1,4})?$/;

function languageOf(lang: string): LanguageCode {
  return isLanguageCode(lang) ? lang : DEFAULT_LANGUAGE;
}

/**
 * Tutarı dile göre biçimler (ör. ru `1 234,50 ₼`). Yuvarlama yarım yukarı, sıfırdan uzağa
 * (Intl `halfExpand`, core/money.ts ile aynı). Şemaya uymayan tutar veya `currency.code` ile
 * uyuşmayan para birimi programlama hatasıdır: TypeError.
 */
export function formatMoney(money: MoneyAmount, lang: string, currency: CurrencyFormat): string {
  if (!DECIMAL_TEXT.test(money.amount)) {
    throw new TypeError('Tutar Decimal metni olmalı (ör. "1234.50")');
  }
  if (money.currency !== currency.code) {
    throw new TypeError('Tutarın para birimi ile biçim bilgisi uyuşmuyor');
  }
  const formatter = new Intl.NumberFormat(languageOf(lang), {
    style: 'currency',
    currency: currency.code,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: currency.decimals,
    maximumFractionDigits: currency.decimals,
    roundingMode: 'halfExpand',
  });
  // Sembol CLDR'dan değil, tablodan (CLDR'da dar sembolü olmayan para birimi kodla görünür).
  return formatter
    .formatToParts(money.amount as Intl.StringNumericLiteral)
    .map((part) => (part.type === 'currency' ? currency.symbol : part.value))
    .join('');
}

/** Saat dilimi zinciri (US-059 AC2). Boş veya geçersiz halka atlanır. */
export interface TimeZoneChain {
  readonly user?: string | null;
  readonly business?: string | null;
  readonly country: string;
}

function isValidTimeZone(timeZone: string): boolean {
  if (timeZone === '') return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone });
    return true;
  } catch (error: unknown) {
    // Geçersiz IANA adı RangeError verir; zincirde sonraki halkaya geçilir.
    if (error instanceof RangeError) return false;
    throw error;
  }
}

/** Zincirdeki ilk geçerli saat dilimi; ülkeninki de geçersizse TypeError. */
export function resolveTimeZone(chain: TimeZoneChain): string {
  for (const candidate of [chain.user, chain.business, chain.country]) {
    if (candidate !== undefined && candidate !== null && isValidTimeZone(candidate)) {
      return candidate;
    }
  }
  throw new TypeError('Geçerli saat dilimi yok (ülke saat dilimi de geçersiz)');
}

const DATE_LOCALES: Record<LanguageCode, Locale> = { az, ru, tr, en: enUS };

function zoned(isoUtc: string, chain: TimeZoneChain): TZDate {
  const instant = parseISO(isoUtc);
  if (!isValid(instant)) {
    throw new TypeError('Zaman ISO 8601 olmalı (ör. "2026-10-24T08:00:00Z")');
  }
  return new TZDate(instant, resolveTimeZone(chain));
}

/** Tarih ve saat (ör. az `24.10.2026, 12:05`). */
export function formatDateTime(isoUtc: string, lang: string, chain: TimeZoneChain): string {
  return formatDateFns(zoned(isoUtc, chain), 'Pp', { locale: DATE_LOCALES[languageOf(lang)] });
}

/** Yalnızca tarih (ör. az `24.10.2026`); gün sınırı saat dilimine göre. */
export function formatDate(isoUtc: string, lang: string, chain: TimeZoneChain): string {
  return formatDateFns(zoned(isoUtc, chain), 'P', { locale: DATE_LOCALES[languageOf(lang)] });
}
