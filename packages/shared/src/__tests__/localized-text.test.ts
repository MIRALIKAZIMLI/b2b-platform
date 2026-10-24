import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_CODES,
  localizedTextSchema,
  pickLocalizedText,
} from '../localized-text';

describe('LocalizedText (shared/localized-text.ts)', () => {
  it('US-058 AC3: istenen dil doluysa o dil döner', () => {
    expect(pickLocalizedText({ az: 'Un', ru: 'Мука', tr: 'Un (tr)' }, 'ru')).toBe('Мука');
  });

  it('US-058 AC3: istenen dil eksikse varsayılan dil (az) döner', () => {
    expect(pickLocalizedText({ az: 'Un', ru: 'Мука' }, 'tr')).toBe('Un');
  });

  it('US-058 AC3: boş veya yalnızca boşluk olan değer eksik sayılır', () => {
    expect(pickLocalizedText({ az: 'Un', tr: '   ' }, 'tr')).toBe('Un');
    expect(pickLocalizedText({ az: '', ru: 'Мука' }, 'tr')).toBe('Мука');
  });

  it('US-058 AC3: az da yoksa dil sırasına göre ilk dolu dil döner (ADR-0007)', () => {
    expect(pickLocalizedText({ en: 'Flour', tr: 'Un' }, 'ru')).toBe('Un');
    expect(pickLocalizedText({ en: 'Flour' }, 'ru')).toBe('Flour');
  });

  it('US-058 AC3: işletme varsayılan dili verilirse az\'dan önce denenir (ADR-0007)', () => {
    expect(pickLocalizedText({ az: 'Un', ru: 'Мука' }, 'tr', { businessDefault: 'ru' })).toBe(
      'Мука',
    );
  });

  it('US-058 AC3: hiç dolu dil yoksa undefined', () => {
    expect(pickLocalizedText({ az: '' }, 'az')).toBeUndefined();
  });

  it('US-058 AC3: bilinmeyen dil kodu istenirse geri dönüş zinciri uygulanır', () => {
    expect(pickLocalizedText({ az: 'Un' }, 'xx')).toBe('Un');
  });

  it('US-058: dil listesi ve varsayılan dil openapi LanguageCode ile aynı', () => {
    expect(LANGUAGE_CODES).toEqual(['az', 'ru', 'tr', 'en']);
    expect(DEFAULT_LANGUAGE).toBe('az');
  });

  it('US-058: şema en az bir dil ister, bilinmeyen dili reddeder', () => {
    expect(localizedTextSchema.safeParse({ az: 'Un' }).success).toBe(true);
    expect(localizedTextSchema.safeParse({}).success).toBe(false);
    expect(localizedTextSchema.safeParse({ de: 'Mehl' }).success).toBe(false);
    expect(localizedTextSchema.safeParse({ az: 1 }).success).toBe(false);
  });
});
