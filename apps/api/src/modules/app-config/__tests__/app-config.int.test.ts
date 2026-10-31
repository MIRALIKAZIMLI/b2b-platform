// `GET /api/app-config` (US-060, F1.14b): gerçek PostgreSQL + Redis, değerler platform ayarından.
// Her test kendi ayarlarını yazar; sonunda ayarlar varsayılana döner (dosyalar sırayla çalışır).
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { SettingKey } from '@b2b/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../../../test/http-app';
import { insertTestUsers } from '../../../../test/users';
import { SettingsService } from '../../settings';

const actor = { userId: randomUUID() };
const TOUCHED: SettingKey[] = [
  'mobile.min_version.android',
  'mobile.recommended_version.android',
  'mobile.store_url.android',
  'mobile.min_version.ios',
  'system.maintenance',
];
const DEFAULTS: Record<string, unknown> = {
  'mobile.min_version.android': '0.0.0',
  'mobile.recommended_version.android': '0.0.0',
  'mobile.store_url.android': '',
  'mobile.min_version.ios': '0.0.0',
  'system.maintenance': false,
};

interface AppConfigJson {
  readonly minVersion: string;
  readonly recommendedVersion: string;
  readonly updateRequired: boolean;
  readonly storeUrl?: string;
  readonly maintenance: boolean;
}

describe('GET /api/app-config', () => {
  let app: NestFastifyApplication;
  let settings: SettingsService;

  beforeAll(async () => {
    await insertTestUsers(actor.userId);
    app = await createTestApp({ env: { REDIS_URL: process.env.REDIS_URL ?? '' } });
    settings = app.get(SettingsService);
  });

  afterEach(async () => {
    for (const key of TOUCHED) {
      await settings.set(key, DEFAULTS[key], { scope: 'platform' }, actor);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  async function setAll(values: Partial<Record<SettingKey, unknown>>): Promise<void> {
    for (const [key, value] of Object.entries(values)) {
      await settings.set(key as SettingKey, value, { scope: 'platform' }, actor);
    }
  }

  async function config(platform: string, version: string) {
    return request(app.getHttpServer()).get('/api/app-config').query({ platform, version });
  }

  it('US-060 AC1: minimum sürümün altı → updateRequired: true + mağaza bağlantısı', async () => {
    await setAll({
      'mobile.min_version.android': '1.4.0',
      'mobile.store_url.android': 'https://example.com/b2b.apk',
    });

    const response = await config('android', '1.3.9');

    expect(response.status).toBe(200);
    expect(response.body as AppConfigJson).toEqual({
      minVersion: '1.4.0',
      recommendedVersion: '1.4.0',
      updateRequired: true,
      storeUrl: 'https://example.com/b2b.apk',
      maintenance: false,
    });
  });

  it('US-060 AC1: minimum sürüme eşit → güncelleme zorunlu değil; ayar platforma özel', async () => {
    await setAll({ 'mobile.min_version.android': '1.4.0', 'mobile.min_version.ios': '2.0.0' });

    const android = await config('android', '1.4.0');
    const ios = await config('ios', '1.4.0');

    expect((android.body as AppConfigJson).updateRequired).toBe(false);
    expect((ios.body as AppConfigJson).updateRequired).toBe(true);
  });

  it('US-060 AC2: önerilen sürüm daha yeni, minimum karşılanıyor → yalnızca öneri', async () => {
    await setAll({
      'mobile.min_version.android': '1.0.0',
      'mobile.recommended_version.android': '1.2.0',
    });

    const response = await config('android', '1.1.0');

    expect(response.status).toBe(200);
    const body = response.body as AppConfigJson;
    expect(body.updateRequired).toBe(false);
    expect(body.recommendedVersion).toBe('1.2.0');
    expect(body.minVersion).toBe('1.0.0');
  });

  it('US-060 AC1: mağaza bağlantısı ayarlanmamışsa storeUrl alanı yok; bakım bayrağı gelir', async () => {
    await setAll({ 'system.maintenance': true });

    const response = await config('android', '0.1.0');

    const body = response.body as AppConfigJson;
    expect(body).not.toHaveProperty('storeUrl');
    expect(body.maintenance).toBe(true);
  });

  it('US-060 AC1: girişsiz çağrılır; geçersiz platform/sürüm → 422', async () => {
    expect((await config('android', '1.0.0')).status).toBe(200);
    for (const [platform, version] of [
      ['web', '1.0.0'],
      ['android', '1.0'],
      ['android', 'abc'],
    ] as const) {
      const response = await config(platform, version);
      expect(response.status).toBe(422);
      expect((response.body as { code: string }).code).toBe('VALIDATION_FAILED');
    }
  });
});
