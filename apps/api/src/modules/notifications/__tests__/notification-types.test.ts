// F2.13a (US-054 "İstek kabul / red"): yanıt olayları toptancı tarafındaki alıcıya bildirim olur;
// F2.15a: iptal bildirimi alıcı başına `connection.cancel_notice`; `connection.cancelled` bildirim değil.
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { intentsForEvent, NOTIFICATION_EVENT_TYPES } from '../notification-types';
import { NOTIFICATION_TEMPLATES } from '../seed/notifications.seed';

describe('bildirim türleri (F2.13a)', () => {
  it('US-054 kabul ve red olayı satıcı işletmesi adına, konu istek kimliği', () => {
    const payload = {
      requestId: randomUUID(),
      sellerId: randomUUID(),
      buyerId: randomUUID(),
      userId: randomUUID(),
    };
    expect(
      intentsForEvent('connection.accepted', { ...payload, connectionId: randomUUID() }),
    ).toEqual([
      {
        userId: payload.userId,
        businessId: payload.sellerId,
        type: 'connection_accepted',
        subjectId: payload.requestId,
        params: {},
      },
    ]);
    expect(intentsForEvent('connection.rejected', payload)).toEqual([
      {
        userId: payload.userId,
        businessId: payload.sellerId,
        type: 'connection_rejected',
        subjectId: payload.requestId,
        params: {},
      },
    ]);
    expect(NOTIFICATION_EVENT_TYPES).not.toContain('connection.cancelled');
  });

  it('F2.15a-T7 iptal bildirimi karşı tarafın işletmesi adına, konu bağlantı; gerekçe yok', () => {
    const payload = { connectionId: randomUUID(), businessId: randomUUID(), userId: randomUUID() };
    expect(intentsForEvent('connection.cancel_notice', payload)).toEqual([
      {
        userId: payload.userId,
        businessId: payload.businessId,
        type: 'connection_cancelled',
        subjectId: payload.connectionId,
        params: {},
      },
    ]);
    expect(NOTIFICATION_EVENT_TYPES).toContain('connection.cancel_notice');
    // Engel bilgisi şablona da girmez (Mimar notu 3).
    for (const text of Object.values(NOTIFICATION_TEMPLATES.connection_cancelled ?? {})) {
      expect(JSON.stringify(text)).not.toMatch(/blok|блок|engel/i);
    }
  });

  it('US-026-AC1 süre doldu bildirimi toptancı işletmesi adına, konu istek', () => {
    const payload = {
      requestId: randomUUID(),
      sellerId: randomUUID(),
      buyerId: randomUUID(),
      userId: randomUUID(),
    };
    expect(intentsForEvent('connection.request_expired', payload)).toEqual([
      {
        userId: payload.userId,
        businessId: payload.sellerId,
        type: 'connection_request_expired',
        subjectId: payload.requestId,
        params: {},
      },
    ]);
    expect(NOTIFICATION_EVENT_TYPES).toContain('connection.request_expired');
  });

  it('US-054 yeni türlerin az/ru/tr şablonu var', () => {
    for (const type of [
      'connection_accepted',
      'connection_rejected',
      'connection_cancelled',
      'connection_request_expired',
    ]) {
      const template = NOTIFICATION_TEMPLATES[type];
      expect(Object.keys(template ?? {}).sort()).toEqual(['az', 'ru', 'tr']);
    }
  });
});
