// F1.5-AC7 / NFR-96: `/api/v1/dev/*` yalnızca local, test ve staging'de kayıtlıdır.
// Veritabanına bağlanmaz: production'da yol hiç yoktur (404), istek veritabanına ulaşmaz.
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createTestApp } from '../../../../test/http-app';
import { isDevModuleEnabled } from '..';

describe('dev modülü (NFR-96)', () => {
  it('F1.5-AC7: yalnızca local, test ve staging ortamlarında açık', () => {
    expect(isDevModuleEnabled('local')).toBe(true);
    expect(isDevModuleEnabled('test')).toBe(true);
    expect(isDevModuleEnabled('staging')).toBe(true);
    expect(isDevModuleEnabled('production')).toBe(false);
  });

  it("F1.5-AC7: production'da /api/v1/dev/sms-outbox kayıtlı değil → 404", async () => {
    const app = await createTestApp({ env: { APP_ENV: 'production' } });
    try {
      const response = await request(app.getHttpServer()).get('/api/v1/dev/sms-outbox');

      expect(response.status).toBe(404);
      expect((response.body as { code: string }).code).toBe('NOT_FOUND');
    } finally {
      await app.close();
    }
  });

  // Mimar notu (F1.10 S3): yerel depo ucu canlıda kapalı.
  it("F1.10: production'da /api/v1/dev/storage kayıtlı değil → 404", async () => {
    const app = await createTestApp({ env: { APP_ENV: 'production' } });
    try {
      const put = await request(app.getHttpServer())
        .put('/api/v1/dev/storage?token=abc.def')
        .set('Content-Type', 'image/png')
        .send(Buffer.from([0x89, 0x50]));
      const get = await request(app.getHttpServer()).get('/api/v1/dev/storage?token=abc.def');

      expect(put.status).toBe(404);
      expect(get.status).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('F1.10: R2 kullanan ortamda (staging) /api/v1/dev/storage kayıtlı değil → 404', async () => {
    const app = await createTestApp({
      env: {
        APP_ENV: 'staging',
        STORAGE_PROVIDER: 'r2',
        R2_ACCOUNT_ID: 'acc123',
        R2_ACCESS_KEY_ID: 'test-access-id',
        R2_SECRET_ACCESS_KEY: 'unused',
        R2_BUCKET_PUBLIC: 'staging-public',
        R2_BUCKET_PRIVATE: 'staging-private',
        FILES_PUBLIC_BASE_URL: 'https://cdn.example.com',
      },
    });
    try {
      const response = await request(app.getHttpServer()).get('/api/v1/dev/storage?token=abc.def');
      expect(response.status).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('F1.10: yerel depoda (local) /api/v1/dev/storage kayıtlı; geçersiz token → 403', async () => {
    const app = await createTestApp();
    try {
      const response = await request(app.getHttpServer()).get('/api/v1/dev/storage?token=abc.def');
      expect(response.status).toBe(403);
    } finally {
      await app.close();
    }
  });
});
