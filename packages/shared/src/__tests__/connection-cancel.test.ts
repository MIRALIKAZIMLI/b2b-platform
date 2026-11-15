// F2.15b bağlantı iptali formu ve yardımcıları (web + mobil ortak; US-025 AC1, AC6).
import { describe, expect, it } from 'vitest';
import {
  CONNECTION_CANCEL_NOTE_MAX,
  CONNECTION_ENDED_BY_SIDES,
  connectionEndedLabel,
  cancelBody,
  cancelFailure,
  connectionCancelSchema,
  customersAccess,
  EMPTY_CANCEL_FORM,
  pushRoute,
} from '../connections';
import { visibleMenu } from '../menu';

describe('F2.15b bağlantı iptali (ortak)', () => {
  it('US-025-AC1 gerekçe ve ikinci onay olmadan gövde yok; not kırpılır, boş not gönderilmez', () => {
    expect(cancelBody(EMPTY_CANCEL_FORM)).toBeUndefined();
    expect(cancelBody({ reason: 'other', note: '', confirmed: false })).toBeUndefined();
    expect(cancelBody({ reason: null, note: '', confirmed: true })).toBeUndefined();
    expect(cancelBody({ reason: 'payment_issue', note: '   ', confirmed: true })).toEqual({
      reason: 'payment_issue',
      confirm: true,
    });
    const body = cancelBody({ reason: 'other', note: '  gecikmə  ', confirmed: true });
    expect(body).toEqual({ reason: 'other', note: 'gecikmə', confirm: true });
    // Üretilen gövde API şemasından geçer.
    expect(connectionCancelSchema.parse(body)).toEqual(body);
    expect(
      cancelBody({
        reason: 'other',
        note: 'x'.repeat(CONNECTION_CANCEL_NOTE_MAX + 1),
        confirmed: true,
      }),
    ).toBeUndefined();
  });

  it('US-025-AC1 API şeması: confirm yalnız true, engel gerekçesi istemciden gelemez', () => {
    expect(connectionCancelSchema.safeParse({ reason: 'other', confirm: false }).success).toBe(
      false,
    );
    expect(connectionCancelSchema.safeParse({ reason: 'blocked', confirm: true }).success).toBe(
      false,
    );
    expect(
      connectionCancelSchema.safeParse({ reason: 'other', confirm: true, endReason: 'x' }).success,
    ).toBe(false);
  });

  it('F2.15b-T1 iptal hatası: aktif olmayan / görünmeyen bağlantı listeyi yeniler, diğerleri genel', () => {
    expect(cancelFailure({ code: 'INVALID_STATE_TRANSITION' })).toEqual({
      key: 'connections.cancel.error.INVALID_STATE_TRANSITION',
      refresh: true,
    });
    expect(cancelFailure({ code: 'NOT_FOUND' }).refresh).toBe(true);
    expect(cancelFailure({ code: 'FORBIDDEN' })).toEqual({
      key: 'errors.FORBIDDEN',
      refresh: false,
    });
    expect(cancelFailure(undefined)).toEqual({ key: 'errors.INTERNAL_ERROR', refresh: false });
  });

  it('US-025-AC1 iptal düğmesi yalnız connections.cancel ile; satış temsilcisi göremez', () => {
    expect(customersAccess(['connections.view', 'connections.cancel'])).toEqual({
      view: true,
      manage: false,
      cancel: true,
    });
    expect(customersAccess(['connections.view']).cancel).toBe(false);
  });

  it('US-025-AC6 perakendeci menüsünde Toptancılarım hazır; yeniden bağlan menüsü yok', () => {
    const menu = visibleMenu('buyer', ['connections.view']);
    expect(menu.find((item) => item.key === 'suppliers')).toMatchObject({
      ready: true,
      path: 'suppliers',
    });
    expect(menu.some((item) => item.key === 'directory' || item.key === 'requests')).toBe(false);
  });

  it('F2.15b-T2 iptal bildirimine dokunuş: perakendecide toptancılarım, toptancıda müşteriler', () => {
    const data = { type: 'connection_cancelled', id: '0190a3b4-0000-7000-8000-000000000001' };
    expect(pushRoute(data, 'buyer')).toEqual({ area: 'buyer', path: 'suppliers' });
    expect(pushRoute(data, 'seller')).toEqual({ area: 'seller', path: 'customers' });
    expect(pushRoute(data)).toEqual({ area: 'buyer', path: 'suppliers' });
    // Tek alanlı türde başka alan istenirse hedef yok.
    expect(pushRoute({ type: 'connection_request' }, 'seller')).toBeUndefined();
  });
});

describe('connectionEndedLabel (F2.18)', () => {
  it('US-016 AC2 platform kapatması karşı taraf iptali olarak gösterilmez', () => {
    expect(connectionEndedLabel('platform', 'seller')).toBe('ended_by_platform');
    expect(connectionEndedLabel('platform', 'buyer')).toBe('ended_by_platform');
    expect(connectionEndedLabel('seller', 'seller')).toBe('ended_by_you');
    expect(connectionEndedLabel('buyer', 'seller')).toBe('ended_by_other');
    expect(CONNECTION_ENDED_BY_SIDES).toEqual(['seller', 'buyer', 'platform']);
  });
});
