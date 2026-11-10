// F2.13a (US-054 "İstek kabul / red"): yanıt olayları toptancı tarafındaki alıcıya bildirim olur;
// `connection.cancelled` bildirimi F2.15'te (şimdilik bildirim yok).
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

  it('US-054 yeni türlerin az/ru/tr şablonu var', () => {
    for (const type of ['connection_accepted', 'connection_rejected']) {
      const template = NOTIFICATION_TEMPLATES[type];
      expect(Object.keys(template ?? {}).sort()).toEqual(['az', 'ru', 'tr']);
    }
  });
});
