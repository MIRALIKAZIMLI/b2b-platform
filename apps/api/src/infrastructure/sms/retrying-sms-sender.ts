// Senkron SMS çağrısı stratejisi (integrations.md §2 ve §8, SF-01): her deneme en çok 5 sn;
// geçici hatada 2 kez yeniden dener (1 sn, 3 sn bekleme), sonra son hatayı atar.
// Devre kesici F6.5'te (gerçek sağlayıcıyla) eklenir.
import { SmsSender, type SmsMessage, type SmsSendResult } from '../../core/ports/sms-sender';

export interface SmsRetryPolicy {
  /** Tek deneme zaman aşımı (ms). */
  readonly timeoutMs: number;
  /** Yeniden denemeler arası bekleme (ms); uzunluğu yeniden deneme sayısıdır. */
  readonly retryDelaysMs: readonly number[];
}

/** integrations.md §2 / §8 değerleri. */
export const DEFAULT_SMS_RETRY_POLICY: SmsRetryPolicy = {
  timeoutMs: 5000,
  retryDelaysMs: [1000, 3000],
};

export class SmsTimeoutError extends Error {
  override readonly name = 'SmsTimeoutError';

  constructor() {
    super('SMS gönderimi zaman aşımına uğradı');
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new SmsTimeoutError());
    }, ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export class RetryingSmsSender extends SmsSender {
  constructor(
    private readonly inner: SmsSender,
    private readonly policy: SmsRetryPolicy = DEFAULT_SMS_RETRY_POLICY,
  ) {
    super();
  }

  async send(message: SmsMessage): Promise<SmsSendResult> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.policy.retryDelaysMs.length; attempt++) {
      if (attempt > 0) {
        await wait(this.policy.retryDelaysMs[attempt - 1] ?? 0);
      }
      try {
        return await withTimeout(this.inner.send(message), this.policy.timeoutMs);
      } catch (error: unknown) {
        lastError = error;
      }
    }
    throw lastError;
  }
}
