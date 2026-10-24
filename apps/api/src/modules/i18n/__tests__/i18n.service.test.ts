// I18nService birim testi: süreç içi önbellek (i18n.cache_ttl_seconds), hata mesajı dili ve
// veritabanı hatasında güvenli geri dönüş (Mimar düzeltmesi D3).
import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FixedClock } from '../../../core/clock';
import { DomainError } from '../../../core/errors/domain-error';
import type { LanguageRow } from '../i18n-snapshot';
import type { I18nRepositoryPort, I18nSettingsPort } from '../i18n.ports';
import { I18nService } from '../i18n.service';

const ROWS: LanguageRow[] = [
  {
    code: 'az',
    isActive: true,
    isDefault: true,
    sortOrder: 1,
    values: { 'errors.NOT_FOUND': 'Tapılmadı' },
  },
  {
    code: 'ru',
    isActive: true,
    isDefault: false,
    sortOrder: 2,
    values: { 'errors.NOT_FOUND': 'Не найдено' },
  },
  { code: 'tr', isActive: true, isDefault: false, sortOrder: 3, values: {} },
  { code: 'en', isActive: false, isDefault: false, sortOrder: 4, values: {} },
];

class FakeRepository implements I18nRepositoryPort {
  calls = 0;
  rows: LanguageRow[] = ROWS;
  failure: Error | undefined;

  async loadLanguages(): Promise<LanguageRow[]> {
    this.calls += 1;
    await Promise.resolve();
    if (this.failure !== undefined) throw this.failure;
    return this.rows;
  }

  async listRegions(): Promise<never[]> {
    return await Promise.resolve([]);
  }
}

const settings: I18nSettingsPort = {
  get: () => Promise.resolve(60),
};

function setup(): { service: I18nService; repository: FakeRepository; clock: FixedClock } {
  const repository = new FakeRepository();
  const clock = new FixedClock(new Date('2026-10-24T08:00:00Z'));
  return { service: new I18nService(repository, settings, clock), repository, clock };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('I18nService', () => {
  it('US-058 AC1: aktif dilin sözlüğü ve ETag döner', async () => {
    const { service } = setup();

    const dictionary = await service.getDictionary('ru');

    expect(dictionary.values['errors.NOT_FOUND']).toBe('Не найдено');
    expect(dictionary.etag).toMatch(/^".+"$/);
  });

  it('US-058 AC4: pasif veya bilinmeyen dil → NOT_FOUND', async () => {
    const { service } = setup();

    for (const lang of ['en', 'xx', 'AZ']) {
      await expect(service.getDictionary(lang)).rejects.toSatisfy(
        (error: unknown) => error instanceof DomainError && error.code === 'NOT_FOUND',
      );
    }
  });

  it('F1.3: önbellek ömrü içinde veritabanı bir kez okunur; ömür dolunca yeniden', async () => {
    const { service, repository, clock } = setup();

    await service.getDictionary('az');
    await service.errorMessage('NOT_FOUND', 'ru');
    clock.advance(59_000);
    await service.getDictionary('tr');
    expect(repository.calls).toBe(1);

    clock.advance(2_000);
    await service.getDictionary('tr');
    expect(repository.calls).toBe(2);
  });

  it('F1.3: aynı anda gelen istekler tek sorgu yapar', async () => {
    const { service, repository } = setup();

    await Promise.all([service.getDictionary('az'), service.errorMessage('NOT_FOUND', 'ru')]);

    expect(repository.calls).toBe(1);
  });

  it('F1.3-AC8: Accept-Language ru → rusça mesaj', async () => {
    const { service } = setup();

    expect(await service.errorMessage('NOT_FOUND', 'ru-RU,ru;q=0.9')).toBe('Не найдено');
  });

  it('F1.3-AC8: desteklenmeyen, pasif dil veya başlık yok → az', async () => {
    const { service } = setup();

    expect(await service.errorMessage('NOT_FOUND', 'de')).toBe('Tapılmadı');
    expect(await service.errorMessage('NOT_FOUND', 'en')).toBe('Tapılmadı');
    expect(await service.errorMessage('NOT_FOUND', undefined)).toBe('Tapılmadı');
    // tr satırı var ama anahtar yok → az.
    expect(await service.errorMessage('NOT_FOUND', 'tr')).toBe('Tapılmadı');
  });

  it('F1.3-AC8: çeviri hiç yoksa mesaj hata kodudur', async () => {
    const { service } = setup();

    expect(await service.errorMessage('OTP_LOCKED', 'ru')).toBe('OTP_LOCKED');
  });

  it('F1.3-AC8 (D3): veritabanı hata verirse mesaj kod olur, uyarı loglanır, hata atılmaz', async () => {
    const { service, repository } = setup();
    repository.failure = Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:5432'), {
      code: 'ECONNREFUSED',
    });
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    expect(await service.errorMessage('NOT_FOUND', 'ru')).toBe('NOT_FOUND');
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = String(warn.mock.calls[0]?.[0]);
    expect(logged).toContain('ECONNREFUSED');
    // Hata mesajı (adres içerebilir) loga yazılmaz.
    expect(logged).not.toContain('10.0.0.5');
  });

  it('F1.3 (D3): hatalı yükleme önbelleğe alınmaz; sonraki istekte yeniden denenir', async () => {
    const { service, repository } = setup();
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    repository.failure = new Error('geçici');

    expect(await service.errorMessage('NOT_FOUND', 'ru')).toBe('NOT_FOUND');
    repository.failure = undefined;

    expect(await service.errorMessage('NOT_FOUND', 'ru')).toBe('Не найдено');
    expect(repository.calls).toBe(2);
  });
});
