import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../../../test/http-app';
import { SettingsService } from '../index';

describe('SettingsModule', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('F1.4-AC1: AppModule SettingsService sağlar (Redis bağlantısı açılışta kurulmaz)', () => {
    expect(app.get(SettingsService)).toBeInstanceOf(SettingsService);
  });
});
