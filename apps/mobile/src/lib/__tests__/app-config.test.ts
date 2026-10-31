import { createApiClient } from '@b2b/api-client';
import { describe, expect, it, vi } from 'vitest';
import { type AppConfig, decideUpdate, getAppConfig } from '../app-config';
import { BASE, json } from './fake-server';

const config = (overrides: Partial<AppConfig> = {}): AppConfig => ({
  minVersion: '1.0.0',
  recommendedVersion: '1.0.0',
  updateRequired: false,
  maintenance: false,
  ...overrides,
});

describe('sürüm kontrolü (US-060)', () => {
  it('US-060 AC1: minimum sürüm altında "Lütfen güncelleyin" + mağaza bağlantısı', () => {
    const url = 'https://example.com/b2b.apk';
    expect(
      decideUpdate(
        config({ minVersion: '1.4.0', updateRequired: true, storeUrl: url }),
        '1.3.9',
        false,
      ),
    ).toEqual({ kind: 'required', storeUrl: url });
    // Öneri kapatılmış olsa da zorunlu güncelleme kapatılamaz.
    expect(decideUpdate(config({ updateRequired: true }), '0.9.0', true)).toEqual({
      kind: 'required',
    });
    // Sunucu bayrağı yanlış olsa bile istemci minimumu kendisi de karşılaştırır.
    expect(decideUpdate(config({ minVersion: '2.0.0' }), '1.10.0', false).kind).toBe('required');
  });

  it('US-060 AC2: önerilen daha yeni, minimum karşılanıyor → kapatılabilir öneri', () => {
    const cfg = config({ minVersion: '1.0.0', recommendedVersion: '1.2.0' });
    expect(decideUpdate(cfg, '1.1.0', false)).toEqual({ kind: 'recommended' });
    expect(decideUpdate(cfg, '1.1.0', true)).toEqual({ kind: 'none' });
    expect(decideUpdate(cfg, '1.2.0', false)).toEqual({ kind: 'none' });
  });

  it('US-060 AC1: yanıt yoksa veya sürüm okunamıyorsa uygulama engellenmez', () => {
    expect(decideUpdate(undefined, '1.0.0', false)).toEqual({ kind: 'none' });
    expect(decideUpdate(config({ updateRequired: true }), '', false)).toEqual({ kind: 'none' });
  });

  it('US-060 AC1: istek sürümsüz uca platform ve sürümle gider; girişsiz', async () => {
    const fetch = vi.fn((request: Request) => {
      const url = new URL(request.url);
      expect(url.pathname).toBe('/api/app-config');
      expect(url.searchParams.get('platform')).toBe('android');
      expect(url.searchParams.get('version')).toBe('1.0.0');
      expect(request.headers.get('Authorization')).toBeNull();
      return Promise.resolve(json(200, config()));
    });
    const client = createApiClient({ baseUrl: BASE, fetch });
    expect(await getAppConfig(client, 'android', '1.0.0')).toEqual(config());
  });
});
