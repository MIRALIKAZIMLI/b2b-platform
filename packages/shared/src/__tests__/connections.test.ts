import { describe, expect, it } from 'vitest';
import { createIdempotencyKey } from '../buyer-registration';
import {
  connectionFailureMessage,
  connectionRequestCreateSchema,
  connectionRequestFailure,
  parseTermDays,
  relationView,
  waitTimeOf,
} from '../connections';
import { visibleMenu } from '../menu';

const BUYER = '0190a3b4-0000-7000-8000-000000000001';

describe('F2.12b bağlantı isteği ekran yardımcıları', () => {
  it('F2.12b-AC1 gövde: boş mesaj gönderilmez, vade 0–180', () => {
    expect(connectionRequestCreateSchema.parse({ buyerId: BUYER, message: '   ' })).toEqual({
      buyerId: BUYER,
    });
    expect(
      connectionRequestCreateSchema.parse({
        buyerId: BUYER,
        message: ' Salam ',
        proposedPaymentTermDays: 30,
      }),
    ).toEqual({ buyerId: BUYER, message: 'Salam', proposedPaymentTermDays: 30 });
    expect(
      connectionRequestCreateSchema.safeParse({ buyerId: BUYER, proposedPaymentTermDays: 181 })
        .success,
    ).toBe(false);
  });

  it('F2.12b-AC1 vade kutusu: boş gönderilmez, 0–180 tam sayı', () => {
    expect(parseTermDays('')).toBeUndefined();
    expect(parseTermDays(' 30 ')).toBe(30);
    expect(parseTermDays('0')).toBe(0);
    expect(parseTermDays('180')).toBe(180);
    expect(parseTermDays('181')).toBe('invalid');
    expect(parseTermDays('-1')).toBe('invalid');
    expect(parseTermDays('7.5')).toBe('invalid');
  });

  it('F2.12b-AC2 bağlantı isteği anahtarı "conn-" ön ekli ve her çağrıda farklı', () => {
    const a = createIdempotencyKey('conn');
    expect(a).toMatch(/^conn-[0-9a-f]{32}$/);
    expect(a.length).toBeLessThanOrEqual(64);
    expect(a).not.toBe(createIdempotencyKey('conn'));
  });

  it('F2.12b-AC3 kart durumu: aktif, bekleyen, engel; yalnız canRequest ise gönder', () => {
    expect(relationView({ status: 'active', cooldownUntil: null, canRequest: false })).toEqual({
      kind: 'active',
    });
    expect(relationView({ status: 'pending', cooldownUntil: null, canRequest: false })).toEqual({
      kind: 'pending',
    });
    expect(relationView({ status: 'blocked', cooldownUntil: null, canRequest: false })).toEqual({
      kind: 'blocked',
    });
    expect(relationView({ status: 'none', cooldownUntil: null, canRequest: true })).toEqual({
      kind: 'send',
    });
    // Bekleme süresi bitmiş red: yeniden gönderilebilir (US-021 AC7 / AC5 sonrası).
    expect(relationView({ status: 'rejected', cooldownUntil: null, canRequest: true })).toEqual({
      kind: 'send',
    });
  });

  it('F2.12b-AC3 409 kodları ekranın kendi metniyle; kart durumu yenilenir', () => {
    for (const code of [
      'CONNECTION_REQUEST_ALREADY_PENDING',
      'CONNECTION_ALREADY_ACTIVE',
      'CONNECTION_BLOCKED',
    ]) {
      expect(connectionRequestFailure({ code })).toMatchObject({
        code,
        known: true,
        relationChanged: true,
      });
    }
  });

  it('F2.12b-AC4 bekleme süresi: bitiş tarihi kartta ve hatada', () => {
    const until = '2026-12-10T08:00:00.000Z';
    expect(relationView({ status: 'rejected', cooldownUntil: until, canRequest: false })).toEqual({
      kind: 'cooldown',
      until,
    });
    expect(
      connectionRequestFailure({
        code: 'CONNECTION_COOLDOWN_ACTIVE',
        details: { cooldownUntil: until },
      }),
    ).toEqual({
      code: 'CONNECTION_COOLDOWN_ACTIVE',
      known: true,
      cooldownUntil: until,
      wait: null,
      relationChanged: true,
    });
    // Tarih gelmezse genel metin (yanlış tarih gösterilmez).
    expect(connectionRequestFailure({ code: 'CONNECTION_COOLDOWN_ACTIVE' }).known).toBe(false);
  });

  it('F2.12b-AC5 429 kalan süre saat + dakika, yukarı yuvarlanır', () => {
    expect(waitTimeOf(3 * 3600 + 61)).toEqual({ hours: 3, minutes: 2 });
    expect(waitTimeOf(59)).toEqual({ hours: 0, minutes: 1 });
    expect(waitTimeOf(0)).toEqual({ hours: 0, minutes: 1 });
    expect(
      connectionRequestFailure({
        code: 'CONNECTION_DAILY_QUOTA_EXCEEDED',
        details: { retryAfter: 60 },
      }),
    ).toMatchObject({ known: true, wait: { hours: 0, minutes: 1 }, relationChanged: false });
  });

  it('F2.12b-AC6 403 salt-okunur abonelik ve 404 anlaşılır; bilinmeyen kod genel metin', () => {
    expect(connectionRequestFailure({ code: 'SUBSCRIPTION_READ_ONLY' })).toMatchObject({
      known: true,
      relationChanged: false,
    });
    expect(connectionRequestFailure({ code: 'NOT_FOUND' })).toMatchObject({
      known: true,
      relationChanged: true,
    });
    expect(connectionRequestFailure({ code: 'VALIDATION_FAILED' }).known).toBe(false);
    expect(connectionRequestFailure(undefined)).toMatchObject({
      code: 'INTERNAL_ERROR',
      known: false,
    });
  });

  it('F2.12b-AC7 "İstekler" menüsü yalnız connections.request.send ile ve hazır', () => {
    const item = visibleMenu('seller', ['connections.request.send']).find(
      (entry) => entry.key === 'requests',
    );
    expect(item).toMatchObject({ ready: true, path: 'requests' });
    expect(visibleMenu('seller', ['directory.search']).some((e) => e.key === 'requests')).toBe(
      false,
    );
  });

  it('F2.12b-AC5 mesaj anahtarı: saat varsa saat+dakika, yoksa yalnız dakika; tarih ham geçer', () => {
    const quota = (retryAfter: number) =>
      connectionFailureMessage(
        connectionRequestFailure({
          code: 'CONNECTION_DAILY_QUOTA_EXCEEDED',
          details: { retryAfter },
        }),
      );
    expect(quota(7200)).toEqual({ key: 'connections.error.quota_hours', hours: 2, minutes: 0 });
    expect(quota(600)).toEqual({ key: 'connections.error.quota_minutes', minutes: 10 });
    const until = '2026-12-10T08:00:00.000Z';
    expect(
      connectionFailureMessage(
        connectionRequestFailure({
          code: 'CONNECTION_COOLDOWN_ACTIVE',
          details: { cooldownUntil: until },
        }),
      ),
    ).toEqual({ key: 'connections.error.CONNECTION_COOLDOWN_ACTIVE', until });
    expect(
      connectionFailureMessage(connectionRequestFailure({ code: 'CONNECTION_BLOCKED' })),
    ).toEqual({ key: 'connections.error.CONNECTION_BLOCKED' });
    expect(connectionFailureMessage(connectionRequestFailure({ code: 'X_UNKNOWN' }))).toEqual({
      key: 'errors.X_UNKNOWN',
    });
  });
});
