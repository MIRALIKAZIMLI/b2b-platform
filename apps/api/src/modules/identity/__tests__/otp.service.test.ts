// OtpService birim testleri: veritabanı ve Redis yerine sahteler. Gerçek akış otp.int.test.ts'de.
import { type SettingKey, settingDefault, type SettingValue } from '@b2b/shared';
import { describe, expect, it } from 'vitest';
import type { AuditRecorder } from '../../../core/audit';
import { FixedClock } from '../../../core/clock';
import { DomainError } from '../../../core/errors/domain-error';
import { SmsSender, type SmsMessage, type SmsSendResult } from '../../../core/ports/sms-sender';
import type { RateDecision } from '../otp-rate-limiter';
import {
  type OtpRateLimiterPort,
  type OtpRepositoryPort,
  OtpService,
  type OtpSettingsPort,
} from '../otp.service';

const KEY = 'test-only-otp-hash-key-0123456789abcdef';
const PHONE = '+994501234567';

class FakeSettings implements OtpSettingsPort {
  get<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
    return Promise.resolve(settingDefault(key));
  }
}

class RecordingSms extends SmsSender {
  readonly sent: SmsMessage[] = [];

  constructor(private readonly fail = false) {
    super();
  }

  send(message: SmsMessage): Promise<SmsSendResult> {
    this.sent.push(message);
    return this.fail
      ? Promise.reject(new Error('sağlayıcı hatası'))
      : Promise.resolve({ providerMessageId: 'x' });
  }
}

function fakeRepository() {
  const created: string[] = [];
  const closed: string[] = [];
  const repository: OtpRepositoryPort = {
    create: (input) => {
      created.push(input.id);
      return Promise.resolve();
    },
    close: (id) => {
      closed.push(id);
      return Promise.resolve();
    },
    withLockedChallenge: () => Promise.reject(new Error('kullanılmıyor')),
  };
  return { repository, created, closed };
}

function fakeLimiter(overrides: Partial<OtpRateLimiterPort> = {}): OtpRateLimiterPort {
  const allowed: RateDecision = { allowed: true };
  return {
    lockRemainingSeconds: () => Promise.resolve(undefined),
    lock: () => Promise.resolve(),
    reserveRequest: () => Promise.resolve(allowed),
    countDailySms: () => Promise.resolve(true),
    ...overrides,
  };
}

const noAudit: AuditRecorder = { record: () => Promise.resolve() };

function createService(options: {
  sms: SmsSender;
  repository: OtpRepositoryPort;
  limiter: OtpRateLimiterPort;
}) {
  let id = 0;
  return new OtpService(
    options.repository,
    options.limiter,
    new FakeSettings(),
    { text: () => Promise.resolve(undefined) },
    options.sms,
    noAudit,
    new FixedClock(new Date('2026-10-25T08:00:00.000Z')),
    { next: () => `0190f1a2-0000-7000-8000-${String(++id).padStart(12, '0')}` },
    { otpHashKey: KEY },
  );
}

async function errorOf(promise: Promise<unknown>): Promise<DomainError> {
  try {
    await promise;
  } catch (error: unknown) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error('hata bekleniyordu');
}

describe('OtpService.requestOtp (birim)', () => {
  it('SF-01: SMS gönderilemezse challenge kapatılır ve SMS_UNAVAILABLE döner', async () => {
    const { repository, created, closed } = fakeRepository();
    const service = createService({
      sms: new RecordingSms(true),
      repository,
      limiter: fakeLimiter(),
    });

    const error = await errorOf(service.requestOtp({ phone: PHONE, purpose: 'login' }));

    expect(error.code).toBe('SMS_UNAVAILABLE');
    expect(closed).toEqual(created);
    expect(created).toHaveLength(1);
  });

  it("Mimar kararı 2: Redis'e ulaşılamazsa kod üretilmez ve SMS gönderilmez", async () => {
    const { repository, created } = fakeRepository();
    const sms = new RecordingSms();
    const service = createService({
      sms,
      repository,
      limiter: fakeLimiter({
        lockRemainingSeconds: () => Promise.reject(new DomainError('SMS_UNAVAILABLE')),
      }),
    });

    const error = await errorOf(service.requestOtp({ phone: PHONE, purpose: 'login' }));

    expect(error.code).toBe('SMS_UNAVAILABLE');
    expect(created).toEqual([]);
    expect(sms.sent).toEqual([]);
  });

  it('çeviri yoksa SMS metni yalnızca koddur', async () => {
    const { repository } = fakeRepository();
    const sms = new RecordingSms();
    const service = createService({ sms, repository, limiter: fakeLimiter() });

    await service.requestOtp({ phone: PHONE, purpose: 'login' });

    expect(sms.sent).toHaveLength(1);
    expect(sms.sent[0]?.body).toMatch(/^\d{6}$/);
    expect(sms.sent[0]?.to).toBe(PHONE);
  });

  it('US-001 AC3: sınır aşıldıysa kod üretilmez, retryAfter döner', async () => {
    const { repository, created } = fakeRepository();
    const sms = new RecordingSms();
    const service = createService({
      sms,
      repository,
      limiter: fakeLimiter({
        reserveRequest: () => Promise.resolve({ allowed: false, retryAfterSeconds: 42 }),
      }),
    });

    const error = await errorOf(service.requestOtp({ phone: PHONE, purpose: 'login' }));

    expect(error.code).toBe('OTP_RATE_LIMITED');
    expect(error.details).toEqual({ retryAfter: 42 });
    expect(created).toEqual([]);
    expect(sms.sent).toEqual([]);
  });

  it('geçersiz purpose → doğrulama hatası', async () => {
    const { repository } = fakeRepository();
    const service = createService({ sms: new RecordingSms(), repository, limiter: fakeLimiter() });

    await expect(
      service.requestOtp({ phone: PHONE, purpose: 'admin' as 'login' }),
    ).rejects.toThrow();
  });
});
