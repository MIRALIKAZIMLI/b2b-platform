// i18n uç noktaları ve hata mesajı dili (US-058, F1.3-AC8, F1.3-AC9): gerçek PostgreSQL
// (app_user) + Redis. Önce seed çalışır; testin kendi anahtarları `test.f13.*` önekiyle eklenir.
// Önbellek ömrü `i18n.cache_ttl_seconds` (60 sn); veri değişince saat ömrün ötesine ilerletilir.
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { sql } from 'drizzle-orm';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createTestApp } from '../../../../test/http-app';
import { Clock, FixedClock } from '../../../core/clock';
import { withPlatformTx } from '../../../core/db';
import { ERROR_MESSAGES } from '../seed/error-messages';
import { seedI18n } from '../seed/i18n.seed';

const platform = { userId: randomUUID() };
const KEY = `test.f13.${randomUUID()}`;
const AFTER_TTL_MS = 61_000;

interface ErrorJson {
  readonly code: string;
  readonly message: string;
}

describe('i18n uç noktaları', () => {
  let app: NestFastifyApplication;
  const clock = new FixedClock(new Date('2026-10-24T08:00:00Z'));

  beforeAll(async () => {
    const owner = new Client({ connectionString: inject('migratorUrl') });
    await owner.connect();
    try {
      await seedI18n(owner);
    } finally {
      await owner.end();
    }
    // tr çevirisi bilerek eksik (US-058 AC3).
    await withPlatformTx(platform, (tx) =>
      tx.execute(sql`insert into ui_translations (key, lang, value)
                     values (${KEY}, 'az', 'Salam'), (${KEY}, 'ru', 'Привет')`),
    );
    app = await createTestApp({
      env: { REDIS_URL: process.env.REDIS_URL ?? '' },
      overrides: [{ provide: Clock, useValue: clock }],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  function http() {
    return request(app.getHttpServer());
  }

  it('US-058 AC1: /i18n/ru rusça değerleri döner', async () => {
    const response = await http().get('/api/v1/i18n/ru');

    expect(response.status).toBe(200);
    const body = response.body as Record<string, string>;
    expect(body[KEY]).toBe('Привет');
    expect(body['errors.NOT_FOUND']).toBe(ERROR_MESSAGES.NOT_FOUND.ru);
  });

  it("US-058 AC3: tr'de eksik anahtar az değeriyle gelir", async () => {
    const response = await http().get('/api/v1/i18n/tr');

    expect(response.status).toBe(200);
    const body = response.body as Record<string, string>;
    expect(body[KEY]).toBe('Salam');
    expect(body['errors.NOT_FOUND']).toBe(ERROR_MESSAGES.NOT_FOUND.tr);
  });

  it('US-058 AC4: pasif en → 404 · aktif yapılınca 200', async () => {
    const passive = await http().get('/api/v1/i18n/en');
    expect(passive.status).toBe(404);
    expect((passive.body as ErrorJson).code).toBe('NOT_FOUND');

    await withPlatformTx(platform, (tx) =>
      tx.execute(sql`update languages set is_active = true where code = 'en'`),
    );
    try {
      clock.advance(AFTER_TTL_MS);
      const active = await http().get('/api/v1/i18n/en');
      expect(active.status).toBe(200);
      // en çevirisi yok: bütün anahtarlar az değeriyle (US-058 AC3).
      expect((active.body as Record<string, string>)[KEY]).toBe('Salam');
    } finally {
      await withPlatformTx(platform, (tx) =>
        tx.execute(sql`update languages set is_active = false where code = 'en'`),
      );
      clock.advance(AFTER_TTL_MS);
    }
  });

  it('US-058 AC4: languages tablosunda olmayan dil (xx) → 404 NOT_FOUND', async () => {
    const response = await http().get('/api/v1/i18n/xx');

    expect(response.status).toBe(404);
    expect((response.body as ErrorJson).code).toBe('NOT_FOUND');
  });

  it('F1.3-AC9: ETag aynıysa 304, gövde yok; Cache-Control no-cache', async () => {
    const first = await http().get('/api/v1/i18n/ru');
    const etag = first.headers.etag;
    expect(typeof etag).toBe('string');
    expect(first.headers['cache-control']).toBe('no-cache');

    const second = await http().get('/api/v1/i18n/ru').set('If-None-Match', String(etag));

    expect(second.status).toBe(304);
    expect(second.text).toBe('');
    expect(second.headers.etag).toBe(etag);
  });

  it('F1.3-AC9: çeviri değişince ETag değişir ve eski ETag ile 200 döner', async () => {
    const before = await http().get('/api/v1/i18n/ru');
    const oldEtag = String(before.headers.etag);

    await withPlatformTx(platform, (tx) =>
      tx.execute(sql`update ui_translations set value = 'Здравствуйте'
                     where key = ${KEY} and lang = 'ru'`),
    );
    clock.advance(AFTER_TTL_MS);

    const after = await http().get('/api/v1/i18n/ru').set('If-None-Match', oldEtag);
    expect(after.status).toBe(200);
    expect(after.headers.etag).not.toBe(oldEtag);
    expect((after.body as Record<string, string>)[KEY]).toBe('Здравствуйте');
  });

  it('F1.3-AC8: Accept-Language ru → rusça mesaj', async () => {
    const response = await http().get('/api/v1/i18n/xx').set('Accept-Language', 'ru-RU,ru;q=0.9');

    expect(response.status).toBe(404);
    expect(response.body as ErrorJson).toMatchObject({
      code: 'NOT_FOUND',
      message: ERROR_MESSAGES.NOT_FOUND.ru,
    });
  });

  it('F1.3-AC8: desteklenmeyen veya pasif dil → az mesajı', async () => {
    for (const header of ['de', 'en', '']) {
      const response = await http().get('/api/v1/i18n/xx').set('Accept-Language', header);
      expect((response.body as ErrorJson).message).toBe(ERROR_MESSAGES.NOT_FOUND.az);
    }
  });

  it('F1.3-AC8: bilinmeyen yol da Accept-Language dilinde döner', async () => {
    const response = await http().get('/api/v1/yok-boyle-bir-yol').set('Accept-Language', 'tr');

    expect(response.status).toBe(404);
    expect((response.body as ErrorJson).message).toBe(ERROR_MESSAGES.NOT_FOUND.tr);
  });
});

describe('GET /api/v1/catalog/regions', () => {
  let app: NestFastifyApplication;
  const country = 'QZ';
  const cityId = randomUUID();
  const districtId = randomUUID();

  beforeAll(async () => {
    await withPlatformTx(platform, async (tx) => {
      await tx.execute(sql`insert into currencies (code, symbol, decimals, is_active)
                           values ('QZQ', 'Q', 2, true) on conflict do nothing`);
      await tx.execute(sql`insert into countries
                             (code, name, default_currency, default_timezone, phone_prefix)
                           values (${country}, '{"az": "Test"}'::jsonb, 'QZQ', 'Asia/Baku', '+997')
                           on conflict do nothing`);
      await tx.execute(sql`insert into regions (id, country_code, parent_id, type, name) values
        (${districtId}, ${country}, null, 'district', '{"az": "Abşeron r.", "ru": "Апшерон"}'::jsonb),
        (${cityId}, ${country}, null, 'city', '{"az": "Bakı", "ru": "Баку"}'::jsonb)`);
      await tx.execute(sql`update regions set parent_id = ${cityId} where id = ${districtId}`);
    });
    app = await createTestApp({ env: { REDIS_URL: process.env.REDIS_URL ?? '' } });
  });

  afterAll(async () => {
    await app.close();
  });

  it('F1.3: openapi Region şemasıyla, önce şehirler sonra rayonlar', async () => {
    const response = await request(app.getHttpServer()).get(
      `/api/v1/catalog/regions?country=${country}`,
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      { id: cityId, countryCode: country, parentId: null, type: 'city', name: { az: 'Bakı', ru: 'Баку' } },
      {
        id: districtId,
        countryCode: country,
        parentId: cityId,
        type: 'district',
        name: { az: 'Abşeron r.', ru: 'Апшерон' },
      },
    ]);
  });

  it('F1.3: bilinmeyen ülke boş liste; ülke verilmezse AZ', async () => {
    const unknown = await request(app.getHttpServer()).get('/api/v1/catalog/regions?country=QQ');
    const byDefault = await request(app.getHttpServer()).get('/api/v1/catalog/regions');

    expect(unknown.status).toBe(200);
    expect(unknown.body).toEqual([]);
    expect(byDefault.status).toBe(200);
    for (const region of byDefault.body as { countryCode: string }[]) {
      expect(region.countryCode).toBe('AZ');
    }
  });

  it('F1.3: geçersiz ülke kodu → 422 VALIDATION_FAILED', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/catalog/regions?country=az');

    expect(response.status).toBe(422);
    expect((response.body as ErrorJson).code).toBe('VALIDATION_FAILED');
  });
});
