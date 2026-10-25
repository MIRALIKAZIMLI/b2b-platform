import { describe, expect, it } from 'vitest';
import { FixedClock } from '../../../core/clock';
import { SmsSender, type SmsMessage, type SmsSendResult } from '../../../core/ports/sms-sender';
import { MockSmsSender } from '../mock-sms-sender';
import {
  DEFAULT_SMS_RETRY_POLICY,
  RetryingSmsSender,
  SmsTimeoutError,
} from '../retrying-sms-sender';

const MESSAGE: SmsMessage = { to: '+994501234567', body: '123456', purpose: 'otp' };
const FAST = { timeoutMs: 50, retryDelaysMs: [0, 0] };

class FlakySender extends SmsSender {
  calls = 0;

  constructor(private readonly failures: number) {
    super();
  }

  send(): Promise<SmsSendResult> {
    this.calls++;
    if (this.calls <= this.failures) return Promise.reject(new Error('geçici hata'));
    return Promise.resolve({ providerMessageId: `p-${String(this.calls)}` });
  }
}

class HangingSender extends SmsSender {
  calls = 0;

  send(): Promise<SmsSendResult> {
    this.calls++;
    return new Promise(() => undefined);
  }
}

describe('RetryingSmsSender (integrations §2, §8; SF-01)', () => {
  it('geçici hatada 2 kez yeniden dener ve başarır', async () => {
    const inner = new FlakySender(2);

    await expect(new RetryingSmsSender(inner, FAST).send(MESSAGE)).resolves.toEqual({
      providerMessageId: 'p-3',
    });
    expect(inner.calls).toBe(3);
  });

  it('3 deneme de başarısızsa son hatayı atar', async () => {
    const inner = new FlakySender(10);

    await expect(new RetryingSmsSender(inner, FAST).send(MESSAGE)).rejects.toThrow('geçici hata');
    expect(inner.calls).toBe(3);
  });

  it('yanıt vermeyen sağlayıcı zaman aşımına uğrar (her deneme)', async () => {
    const inner = new HangingSender();

    await expect(new RetryingSmsSender(inner, FAST).send(MESSAGE)).rejects.toBeInstanceOf(
      SmsTimeoutError,
    );
    expect(inner.calls).toBe(3);
  });

  it('varsayılan politika: 5 sn zaman aşımı, 1 sn ve 3 sn bekleme', () => {
    expect(DEFAULT_SMS_RETRY_POLICY).toEqual({ timeoutMs: 5000, retryDelaysMs: [1000, 3000] });
  });
});

describe('MockSmsSender (NFR-96)', () => {
  it('US-001 AC6: SMS göndermez, mesajı yalnızca outbox deposuna yazar', async () => {
    const written: unknown[] = [];
    const clock = new FixedClock(new Date('2026-10-25T08:00:00.000Z'));
    const sender = new MockSmsSender(
      {
        insert: (input) => {
          written.push(input);
          return Promise.resolve();
        },
      },
      { next: () => '0190f1a2-0000-7000-8000-00000000000a' },
      clock,
    );

    await expect(sender.send(MESSAGE)).resolves.toEqual({
      providerMessageId: 'mock:0190f1a2-0000-7000-8000-00000000000a',
    });
    expect(written).toEqual([
      {
        id: '0190f1a2-0000-7000-8000-00000000000a',
        phone: '+994501234567',
        body: '123456',
        now: clock.now(),
      },
    ]);
  });
});
