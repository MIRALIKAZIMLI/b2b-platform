// Seed'deki hata mesajı çevirileri (Mimar düzeltmesi D5): her ErrorCode için az, ru, tr.
import { ERROR_CODES } from '@b2b/shared';
import { describe, expect, it } from 'vitest';
import { ERROR_MESSAGES } from '../seed/error-messages';

describe('hata mesajı çevirileri (seed)', () => {
  it('F1.3 (D5): her ErrorCode için az, ru, tr dolu çeviri var', () => {
    for (const code of ERROR_CODES) {
      for (const lang of ['az', 'ru', 'tr'] as const) {
        const value = ERROR_MESSAGES[code][lang];
        expect({ code, lang, filled: value.trim().length > 0 }).toEqual({
          code,
          lang,
          filled: true,
        });
      }
    }
  });

  it('F1.3 (D5): ErrorCode listesinde olmayan anahtar yok', () => {
    expect(Object.keys(ERROR_MESSAGES).sort()).toEqual([...ERROR_CODES].sort());
  });

  it('F1.3 (D5): bir dildeki mesaj kodun kendisi değildir', () => {
    for (const code of ERROR_CODES) {
      for (const lang of ['az', 'ru', 'tr'] as const) {
        expect(ERROR_MESSAGES[code][lang]).not.toBe(code);
      }
    }
  });
});
