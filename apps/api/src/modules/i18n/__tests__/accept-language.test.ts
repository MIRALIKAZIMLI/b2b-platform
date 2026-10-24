import { describe, expect, it } from 'vitest';
import { parseAcceptLanguage } from '../accept-language';

describe('parseAcceptLanguage', () => {
  it('F1.3-AC8: ana dil etiketi, küçük harf, q değerine göre sıralı', () => {
    expect(parseAcceptLanguage('ru-RU,ru;q=0.9,en;q=0.8')).toEqual(['ru', 'en']);
    expect(parseAcceptLanguage('en;q=0.5, TR, az;q=0.7')).toEqual(['tr', 'az', 'en']);
  });

  it('F1.3-AC8: eşit q değerinde başlıktaki sıra korunur', () => {
    expect(parseAcceptLanguage('tr, ru')).toEqual(['tr', 'ru']);
  });

  it('F1.3-AC8: q=0, joker (*) ve bozuk girdiler atlanır', () => {
    expect(parseAcceptLanguage('ru;q=0, *, tr;q=abc, 12, az')).toEqual(['az']);
  });

  it('F1.3-AC8: başlık yoksa veya boşsa boş liste', () => {
    expect(parseAcceptLanguage(undefined)).toEqual([]);
    expect(parseAcceptLanguage('')).toEqual([]);
  });

  it('F1.3-AC8: çok uzun başlıkta yalnızca ilk 20 girdi okunur', () => {
    const header = [...Array.from({ length: 30 }, () => 'de'), 'ru'].join(',');
    expect(parseAcceptLanguage(header)).toEqual(['de']);
  });
});
