// Push adaptörleri (birim, F1.11): Expo hata sınıflandırması ve sağlayıcı seçimi. Ağa çıkılmaz.
import { describe, expect, it } from 'vitest';
import { PushPermanentError, PushTransientError } from '../../../core/ports/push-sender';
import { classifyExpoError, createPushSender, ExpoPushSender, MockPushSender } from '../index';

function httpError(statusCode: number): Error {
  return Object.assign(new Error('Expo responded with an error'), { statusCode });
}

describe('Expo hata sınıflandırması', () => {
  it('US-054 AC3: ağ hatası, 429 ve 5xx geçici', () => {
    expect(classifyExpoError(new TypeError('fetch failed'))).toBeInstanceOf(PushTransientError);
    expect(classifyExpoError(httpError(429))).toBeInstanceOf(PushTransientError);
    expect(classifyExpoError(httpError(503))).toBeInstanceOf(PushTransientError);
  });

  it('diğer 4xx kalıcı; hata mesajı iletilmez', () => {
    const error = classifyExpoError(
      Object.assign(new Error('ExponentPushToken[abc123] invalid'), { statusCode: 401 }),
    );
    expect(error).toBeInstanceOf(PushPermanentError);
    expect(error.message).not.toContain('ExponentPushToken');
  });
});

describe('sağlayıcı seçimi', () => {
  it('PUSH_PROVIDER → uygulama', () => {
    expect(createPushSender({ provider: 'mock' })).toBeInstanceOf(MockPushSender);
    expect(createPushSender({ provider: 'expo' })).toBeInstanceOf(ExpoPushSender);
  });

  it('mock: boş makbuz isteğinde ok; ayarlanan bilet döner', async () => {
    const mock = new MockPushSender();
    mock.ticketFor = () => ({ status: 'error', error: 'DeviceNotRegistered' });
    const tickets = await mock.send([
      { token: 'ExponentPushToken[a]', title: 't', body: 'b', data: { type: 'test', id: '1' } },
    ]);
    expect(tickets).toEqual([{ status: 'error', error: 'DeviceNotRegistered' }]);
    expect(mock.sent).toEqual([]);
    const receipts = await mock.getReceipts(['x']);
    expect(receipts.get('x')).toEqual({ status: 'ok' });
  });
});
