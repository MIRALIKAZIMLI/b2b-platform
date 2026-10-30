import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { createOpenApiDocument } from './openapi-document';

describe('createOpenApiDocument', () => {
  it('bağlantı kurmadan uygulamanın uçlarını yol, metot ve başarı koduyla üretir', async () => {
    const document = await createOpenApiDocument();

    expect(Object.keys(document.paths['/api/health']?.get?.responses ?? {})).toEqual(['200']);
    expect(Object.keys(document.paths['/api/v1/auth/otp/request']?.post?.responses ?? {})).toEqual([
      '202',
    ]);
    expect(document.paths['/api/v1/dev/sms-outbox']?.get).toBeDefined();
  }, 30_000);
});
