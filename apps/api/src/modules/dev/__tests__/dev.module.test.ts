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
});
