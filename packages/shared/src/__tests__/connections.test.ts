import { describe, expect, it } from 'vitest';
import { createIdempotencyKey } from '../buyer-registration';
import {
  connectionAcceptSchema,
  connectionFailureMessage,
  connectionRequestCreateSchema,
  connectionRequestFailure,
  incomingAccess,
  incomingCardView,
  parseTermDays,
  pushRoute,
  relationView,
  respondFailure,
  waitTimeOf,
  withPendingRelation,
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

describe('F2.13b yanıt, engel ve push yardımcıları', () => {
  const seller = {
    id: '0190a3b4-0000-7000-8000-0000000000dd',
    name: 'Baku Food Distribution',
    logoUrl: null,
    description: { az: 'Ərzaq topdan satışı', ru: 'Оптовая продажа продуктов' },
  };
  const incoming = {
    id: '0190a3b4-0000-7000-8000-0000000000ee',
    sellerId: seller.id,
    buyerId: BUYER,
    status: 'pending' as const,
    message: 'Salam',
    proposedPaymentTermDays: 30,
    expiresAt: '2026-11-24T00:00:00.000Z',
    createdAt: '2026-11-10T00:00:00.000Z',
    seller,
  };

  it('F2.13b-AC1 kart görünümü: ünvan, baş harf, kullanıcı dilinde tanıtım, mesaj, vade', () => {
    const view = incomingCardView(incoming, 'ru');
    expect(view).toEqual({
      id: incoming.id,
      sellerId: seller.id,
      sellerName: seller.name,
      initials: 'BF',
      logoUrl: null,
      description: 'Оптовая продажа продуктов',
      message: 'Salam',
      termDays: 30,
      expiresAt: incoming.expiresAt,
    });
    // Kullanıcının dili yoksa varsayılan dile düşer; tanıtım yoksa null.
    expect(incomingCardView(incoming, 'tr').description).toBe('Ərzaq topdan satışı');
    expect(
      incomingCardView({ ...incoming, seller: { ...seller, description: null } }, 'az').description,
    ).toBeNull();
    // Ürün, fiyat, başka bağlantı alanı yok (US-023 AC1).
    expect(Object.keys(view).some((key) => /product|price|connection/i.test(key))).toBe(false);
  });

  it('F2.13b-AC2 kabul gövdesi yalnız confirmDataSharing: true', () => {
    expect(connectionAcceptSchema.safeParse({ confirmDataSharing: true }).success).toBe(true);
    expect(connectionAcceptSchema.safeParse({ confirmDataSharing: false }).success).toBe(false);
    expect(connectionAcceptSchema.safeParse({}).success).toBe(false);
  });

  it('F2.13b-AC3 yanıt hataları: 409 süresi dolmuş / durum değişmiş ve 404 listeyi yeniler', () => {
    expect(respondFailure({ code: 'CONNECTION_REQUEST_EXPIRED' })).toEqual({
      key: 'connections.respond_error.CONNECTION_REQUEST_EXPIRED',
      refresh: true,
    });
    expect(respondFailure({ code: 'INVALID_STATE_TRANSITION' })).toEqual({
      key: 'connections.respond_error.INVALID_STATE_TRANSITION',
      refresh: true,
    });
    expect(respondFailure({ code: 'NOT_FOUND' }).refresh).toBe(true);
    expect(respondFailure({ code: 'SUBSCRIPTION_READ_ONLY' })).toEqual({
      key: 'errors.SUBSCRIPTION_READ_ONLY',
      refresh: false,
    });
    expect(respondFailure(undefined)).toEqual({ key: 'errors.INTERNAL_ERROR', refresh: false });
  });

  it('F2.13b-AC5 satın alma sorumlusu görür ama yanıtlayamaz ve engelleyemez; menü hazır', () => {
    expect(incomingAccess(['connections.view'])).toEqual({
      view: true,
      respond: false,
      block: false,
    });
    expect(
      incomingAccess(['connections.view', 'connections.request.respond', 'connections.block']),
    ).toEqual({ view: true, respond: true, block: true });
    const item = visibleMenu('buyer', ['connections.view']).find(
      (entry) => entry.key === 'incoming_requests',
    );
    expect(item).toMatchObject({ ready: true, path: 'incoming-requests' });
    expect(visibleMenu('buyer', []).some((entry) => entry.key === 'incoming_requests')).toBe(false);
  });

  it('F2.13b-AC6 geri çekme hatası: başkasının isteği 404, yanıtlanmış istek 409 anlaşılır', () => {
    expect(respondFailure({ code: 'NOT_FOUND' }).key).toBe('connections.respond_error.NOT_FOUND');
    expect(respondFailure({ code: 'INVALID_STATE_TRANSITION' }).key).toBe(
      'connections.respond_error.INVALID_STATE_TRANSITION',
    );
  });

  it('F2.13b-AC7 push dokunuşu: istek → gelen istekler, yanıt → gönderilen istekler', () => {
    expect(pushRoute({ type: 'connection_request', id: incoming.id })).toEqual({
      area: 'buyer',
      path: 'incoming-requests',
    });
    expect(pushRoute({ type: 'connection_accepted', id: incoming.id })).toEqual({
      area: 'seller',
      path: 'requests',
    });
    expect(pushRoute({ type: 'connection_rejected', id: incoming.id })).toEqual({
      area: 'seller',
      path: 'requests',
    });
    // F2.16 (US-026 AC1): süre doldu bildirimi toptancıyı gönderilen isteklere götürür.
    expect(pushRoute({ type: 'connection_request_expired', id: incoming.id })).toEqual({
      area: 'seller',
      path: 'requests',
    });
    expect(pushRoute({ type: 'team_invitation' })).toBeUndefined();
  });

  it('US-027-AC1 bağlantısız hesap bildirimleri: perakendeci profile, toptancı dizine gider', () => {
    const id = '00000000-0000-7000-8000-000000000001';
    expect(pushRoute({ type: 'dormant_profile_reminder', id })).toEqual({
      area: 'buyer',
      path: 'profile',
    });
    expect(pushRoute({ type: 'dormant_warning', id })).toEqual({ area: 'buyer', path: 'profile' });
    expect(pushRoute({ type: 'new_buyer_in_region', id })).toEqual({
      area: 'seller',
      path: 'directory',
    });
    expect(pushRoute({ type: 'new_buyer_in_region', id }, 'buyer')).toBeUndefined();
    expect(pushRoute({ type: 'toString' })).toBeUndefined();
    expect(pushRoute(null)).toBeUndefined();
    expect(pushRoute('connection_request')).toBeUndefined();
  });

  it('F2.13b-AC8 (#59 L3) idempotens çakışması anlaşılır metin ve kart yenilenir', () => {
    expect(connectionRequestFailure({ code: 'IDEMPOTENCY_CONFLICT' })).toMatchObject({
      known: true,
      relationChanged: true,
    });
    expect(
      connectionFailureMessage(connectionRequestFailure({ code: 'IDEMPOTENCY_CONFLICT' })),
    ).toEqual({ key: 'connections.error.IDEMPOTENCY_CONFLICT' });
    // Hız sınırı ve salt-okunur abonelik kartın durumunu değiştirmez: dizin yeniden aranmaz (L4).
    expect(connectionRequestFailure({ code: 'RATE_LIMITED' }).relationChanged).toBe(false);
    expect(connectionRequestFailure({ code: 'SUBSCRIPTION_READ_ONLY' }).relationChanged).toBe(
      false,
    );
  });

  it('F2.13b-AC8 (#59 L4) başarıda dizin önbelleği yerinde güncellenir', () => {
    const none = { status: 'none', cooldownUntil: null, canRequest: true };
    const other = { id: 'other', relation: none };
    const target = { id: BUYER, legalName: 'A', relation: none };
    const infinite = { pages: [{ items: [other, target], nextCursor: null }], pageParams: [null] };
    const next = withPendingRelation(infinite, BUYER);
    expect(next.pages[0]?.items[1]).toEqual({
      id: BUYER,
      legalName: 'A',
      relation: { status: 'pending', cooldownUntil: null, canRequest: false },
    });
    expect(next.pages[0]?.items[0]).toBe(other);
    expect(infinite.pages[0]?.items[1]?.relation).toBe(none);
    const single = withPendingRelation({ items: [target], nextCursor: null }, BUYER);
    expect(single.items[0]?.relation.status).toBe('pending');
    expect(withPendingRelation(null, BUYER)).toBeNull();
  });
});
