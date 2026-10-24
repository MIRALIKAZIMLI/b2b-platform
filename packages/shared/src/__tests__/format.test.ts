// Beklenen değerler Node'un Intl (CLDR) çıktısıyla sabitlendi (Mimar kararı F1.3, US-059 AC1).
// Tutar beklentilerindeki u00a0 kaçışı bölünmez boşluktur (CLDR çıktısı).
import { describe, expect, it } from 'vitest';
import {
  type CurrencyFormat,
  formatDate,
  formatDateTime,
  formatMoney,
  resolveTimeZone,
} from '../format';

const AZN: CurrencyFormat = { code: 'AZN', symbol: '₼', decimals: 2 };

describe('formatMoney (shared/format.ts)', () => {
  it.each([
    ['az', '1234.50', '1.234,50 ₼'],
    ['ru', '1234.50', '1 234,50 ₼'],
    ['tr', '1234.50', '₼1.234,50'],
    ['az', '1234567.5', '1.234.567,50 ₼'],
    ['ru', '12', '12,00 ₼'],
    ['tr', '0', '₼0,00'],
  ])('US-059 AC1: %s %s → %j', (lang, amount, expected) => {
    expect(formatMoney({ amount, currency: 'AZN' }, lang, AZN)).toBe(expected);
  });

  it('US-059 AC1: para biriminin hanesi kadar ondalık, yarım yukarı (sıfırdan uzağa)', () => {
    expect(formatMoney({ amount: '1234.505', currency: 'AZN' }, 'az', AZN)).toBe('1.234,51 ₼');
    expect(formatMoney({ amount: '-0.125', currency: 'AZN' }, 'ru', AZN)).toBe('-0,13 ₼');
  });

  it("US-059 AC1: tutar number'a çevrilmez (1.005 kayan noktada 1,00 olurdu)", () => {
    expect(formatMoney({ amount: '1.005', currency: 'AZN' }, 'az', AZN)).toBe('1,01 ₼');
  });

  it('US-059 AC1: sembol ve hane currencies tablosundan gelir', () => {
    const kwd: CurrencyFormat = { code: 'KWD', symbol: 'KD', decimals: 3 };
    expect(formatMoney({ amount: '1234.5', currency: 'KWD' }, 'az', kwd)).toBe('1.234,500 KD');
  });

  it('US-059 AC1: Decimal şemasına uymayan tutar veya uyuşmayan para birimi reddedilir', () => {
    expect(() => formatMoney({ amount: '1,5', currency: 'AZN' }, 'az', AZN)).toThrow(TypeError);
    expect(() => formatMoney({ amount: '1e3', currency: 'AZN' }, 'az', AZN)).toThrow(TypeError);
    expect(() => formatMoney({ amount: '1.5', currency: 'USD' }, 'az', AZN)).toThrow(TypeError);
  });

  it('US-059 AC1: bilinmeyen dil varsayılan dille (az) biçimlenir', () => {
    expect(formatMoney({ amount: '1234.50', currency: 'AZN' }, 'xx', AZN)).toBe('1.234,50 ₼');
  });
});

describe('saat dilimi zinciri (shared/format.ts)', () => {
  const AT = '2026-10-24T08:05:00Z';

  it('US-059 AC2: kullanıcının saat dilimi varsa o kullanılır', () => {
    const chain = { user: 'Europe/London', business: 'Europe/Istanbul', country: 'Asia/Baku' };
    expect(resolveTimeZone(chain)).toBe('Europe/London');
    // date-fns yerel ayarları: az ve ru saati sıfırsız (`H:mm`), tr sıfırlı (`HH:mm`) verir.
    expect(formatDateTime(AT, 'az', chain)).toBe('24.10.2026, 9:05');
    expect(formatDateTime(AT, 'ru', chain)).toBe('24.10.2026, 9:05');
    expect(formatDateTime(AT, 'tr', chain)).toBe('24.10.2026, 09:05');
  });

  it('US-059 AC2: kullanıcınınki yoksa işletmenin saat dilimi', () => {
    const chain = { user: null, business: 'Europe/Istanbul', country: 'Asia/Baku' };
    expect(resolveTimeZone(chain)).toBe('Europe/Istanbul');
    expect(formatDateTime(AT, 'tr', chain)).toBe('24.10.2026, 11:05');
  });

  it('US-059 AC2: ikisi de yoksa ülkenin saat dilimi', () => {
    const chain = { country: 'Asia/Baku' };
    expect(resolveTimeZone(chain)).toBe('Asia/Baku');
    expect(formatDateTime(AT, 'ru', chain)).toBe('24.10.2026, 12:05');
  });

  it('US-059 AC2: geçersiz saat dilimi atlanır, zincirde sonrakine geçilir', () => {
    expect(resolveTimeZone({ user: 'Mars/Base', business: '', country: 'Asia/Baku' })).toBe(
      'Asia/Baku',
    );
  });

  it('US-059 AC2: ülke saat dilimi de geçersizse hata', () => {
    expect(() => resolveTimeZone({ country: 'Mars/Base' })).toThrow(TypeError);
  });

  it('US-059 AC2: tarih (saatsiz) biçimi gün sınırını saat dilimine göre çizer', () => {
    // 22:30 UTC, Bakü'de ertesi gün 02:30.
    expect(formatDate('2026-10-24T22:30:00Z', 'az', { country: 'Asia/Baku' })).toBe('25.10.2026');
    expect(formatDate('2026-10-24T22:30:00Z', 'az', { country: 'Europe/London' })).toBe(
      '24.10.2026',
    );
  });

  it('US-059 AC2: ISO 8601 olmayan zaman reddedilir', () => {
    expect(() => formatDateTime('dün', 'az', { country: 'Asia/Baku' })).toThrow(TypeError);
  });
});
