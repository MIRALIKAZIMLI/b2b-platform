import { describe, expect, it } from 'vitest';
import { I18nSnapshot, type LanguageRow, matchesIfNoneMatch } from '../i18n-snapshot';

function rows(overrides: Partial<Record<string, Partial<LanguageRow>>> = {}): LanguageRow[] {
  const base: LanguageRow[] = [
    {
      code: 'az',
      isActive: true,
      isDefault: true,
      sortOrder: 1,
      values: { 'errors.NOT_FOUND': 'Tapılmadı', 'app.title': 'Platforma' },
    },
    {
      code: 'ru',
      isActive: true,
      isDefault: false,
      sortOrder: 2,
      values: { 'errors.NOT_FOUND': 'Не найдено' },
    },
    { code: 'tr', isActive: true, isDefault: false, sortOrder: 3, values: {} },
    { code: 'en', isActive: false, isDefault: false, sortOrder: 4, values: { 'app.title': 'P' } },
  ];
  return base.map((row) => ({ ...row, ...overrides[row.code] }));
}

describe('I18nSnapshot', () => {
  it('US-058 AC1: dilin kendi değerleri döner', () => {
    const dictionary = I18nSnapshot.build(rows()).dictionary('ru');

    expect(dictionary?.values['errors.NOT_FOUND']).toBe('Не найдено');
  });

  it('US-058 AC3: eksik anahtar varsayılan dilin (az) değeriyle gelir', () => {
    const snapshot = I18nSnapshot.build(rows());

    expect(snapshot.dictionary('ru')?.values).toEqual({
      'errors.NOT_FOUND': 'Не найдено',
      'app.title': 'Platforma',
    });
    expect(snapshot.dictionary('tr')?.values).toEqual({
      'errors.NOT_FOUND': 'Tapılmadı',
      'app.title': 'Platforma',
    });
  });

  it('US-058 AC4: pasif veya bilinmeyen dil için sözlük yok', () => {
    const snapshot = I18nSnapshot.build(rows());

    expect(snapshot.dictionary('en')).toBeUndefined();
    expect(snapshot.dictionary('xx')).toBeUndefined();
    expect(
      I18nSnapshot.build(rows({ en: { isActive: true } })).dictionary('en')?.values['app.title'],
    ).toBe('P');
  });

  it('US-058 AC3: varsayılan dil languages.is_default satırından gelir', () => {
    const snapshot = I18nSnapshot.build(
      rows({ az: { isDefault: false }, ru: { isDefault: true } }),
    );

    expect(snapshot.defaultLanguage).toBe('ru');
    expect(snapshot.dictionary('tr')?.values['errors.NOT_FOUND']).toBe('Не найдено');
  });

  it('F1.3-AC8: dil seçimi: ilk aktif aday, yoksa varsayılan dil', () => {
    const snapshot = I18nSnapshot.build(rows());

    expect(snapshot.pickLanguage(['de', 'ru', 'tr'])).toBe('ru');
    expect(snapshot.pickLanguage(['en', 'de'])).toBe('az');
    expect(snapshot.pickLanguage([])).toBe('az');
  });

  it('F1.3-AC8: çeviri: dil → varsayılan dil → yok', () => {
    const snapshot = I18nSnapshot.build(rows());

    expect(snapshot.translate('errors.NOT_FOUND', 'ru')).toBe('Не найдено');
    expect(snapshot.translate('errors.NOT_FOUND', 'tr')).toBe('Tapılmadı');
    expect(snapshot.translate('errors.YOK', 'tr')).toBeUndefined();
  });

  it('F1.3-AC9: ETag aynı içerikte aynı, değişince farklı, diller arasında farklı', () => {
    const a = I18nSnapshot.build(rows()).dictionary('ru')?.etag;
    const b = I18nSnapshot.build(rows()).dictionary('ru')?.etag;
    const changed = I18nSnapshot.build(
      rows({ ru: { values: { 'errors.NOT_FOUND': 'Нет' } } }),
    ).dictionary('ru')?.etag;
    const tr = I18nSnapshot.build(rows()).dictionary('tr')?.etag;

    expect(a).toMatch(/^"[A-Za-z0-9_-]+"$/);
    expect(b).toBe(a);
    expect(changed).not.toBe(a);
    expect(tr).not.toBe(a);
  });
});

describe('matchesIfNoneMatch', () => {
  const etag = '"abc"';

  it('F1.3-AC9: aynı ETag, liste içinde ETag, zayıf ETag ve * eşleşir', () => {
    expect(matchesIfNoneMatch('"abc"', etag)).toBe(true);
    expect(matchesIfNoneMatch('"x", "abc"', etag)).toBe(true);
    expect(matchesIfNoneMatch('W/"abc"', etag)).toBe(true);
    expect(matchesIfNoneMatch('*', etag)).toBe(true);
  });

  it('F1.3-AC9: farklı veya eksik başlık eşleşmez', () => {
    expect(matchesIfNoneMatch('"abd"', etag)).toBe(false);
    expect(matchesIfNoneMatch(undefined, etag)).toBe(false);
    expect(matchesIfNoneMatch('', etag)).toBe(false);
  });
});
