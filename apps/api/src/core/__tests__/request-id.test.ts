import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../../test/http-app';
import { isSafeRequestId } from '../request-id.middleware';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('X-Request-Id', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('F1.2-AC6: başlık yoksa yeni kimlik üretilir ve yanıtta döner', async () => {
    const response = await request(app.getHttpServer()).get('/api/health');

    expect(response.headers['x-request-id']).toMatch(UUID);
  });

  it('F1.2-AC6: güvenli gelen değer korunur', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/health')
      .set('X-Request-Id', 'mobile-req-12345678');

    expect(response.headers['x-request-id']).toBe('mobile-req-12345678');
  });

  it.each([
    ['boşluk ve özel karakter', 'abc 123<script>'],
    ['çok kısa', 'abc1234'],
    ['çok uzun', 'a'.repeat(65)],
    ['satır sonu ile log enjeksiyonu', 'abcdefgh\\n{"level":"error"}'],
  ])('F1.2-AC6: güvensiz değer (%s) yenisiyle değiştirilir', async (_name, value) => {
    const response = await request(app.getHttpServer())
      .get('/api/health')
      .set('X-Request-Id', value);

    expect(response.headers['x-request-id']).toMatch(UUID);
    expect(response.headers['x-request-id']).not.toBe(value);
  });

  it('F1.2-AC6: hata yanıtında da aynı kimlik döner', async () => {
    const response = await request(app.getHttpServer())
      .get('/yok-boyle-bir-yol')
      .set('X-Request-Id', 'trace-abcdef-0001');

    expect(response.headers['x-request-id']).toBe('trace-abcdef-0001');
    expect((response.body as { requestId: string }).requestId).toBe('trace-abcdef-0001');
  });

  it('isSafeRequestId: yalnızca harf, rakam ve tire; 8-64 karakter', () => {
    expect(isSafeRequestId('abcd-1234')).toBe(true);
    expect(isSafeRequestId('a'.repeat(64))).toBe(true);
    expect(isSafeRequestId('a'.repeat(65))).toBe(false);
    expect(isSafeRequestId('abc_1234')).toBe(false);
    expect(isSafeRequestId(undefined)).toBe(false);
    expect(isSafeRequestId(['abcd-1234', 'efgh-5678'])).toBe(false);
  });
});
