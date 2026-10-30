// Expo Push Service adaptörü (integrations §3, `expo-server-sdk`). Yalnızca worker kullanır.
// Hata sınıflandırması: ağ hatası ve HTTP 429/5xx geçici (PushTransientError), diğer HTTP hataları
// kalıcı (PushPermanentError). Hata mesajı token veya metin içerebileceği için iletilmez.
import { Expo, type ExpoPushReceipt, type ExpoPushTicket } from 'expo-server-sdk';
import {
  type PushErrorCode,
  type PushMessage,
  type PushReceipt,
  PushPermanentError,
  PushSender,
  type PushTicket,
  PushTransientError,
} from '../../core/ports/push-sender';

const KNOWN_ERRORS: ReadonlySet<string> = new Set<PushErrorCode>([
  'DeviceNotRegistered',
  'InvalidCredentials',
  'MessageTooBig',
  'MessageRateExceeded',
  'DeveloperError',
  'ExpoError',
  'ProviderError',
]);

function errorCode(details: { error?: string } | undefined): PushErrorCode {
  const code = details?.error;
  return code !== undefined && KNOWN_ERRORS.has(code) ? (code as PushErrorCode) : 'Unknown';
}

/** SDK hatasını geçici / kalıcı olarak sınıflar (mesaj taşınmaz). */
export function classifyExpoError(error: unknown): PushTransientError | PushPermanentError {
  const status =
    typeof error === 'object' && error !== null && 'statusCode' in error
      ? error.statusCode
      : undefined;
  if (typeof status !== 'number') return new PushTransientError();
  return status === 429 || status >= 500 ? new PushTransientError() : new PushPermanentError();
}

function toTicket(ticket: ExpoPushTicket): PushTicket {
  return ticket.status === 'ok'
    ? { status: 'ok', ticketId: ticket.id }
    : { status: 'error', error: errorCode(ticket.details) };
}

function toReceipt(receipt: ExpoPushReceipt): PushReceipt {
  return receipt.status === 'ok'
    ? { status: 'ok' }
    : { status: 'error', error: errorCode(receipt.details) };
}

export interface ExpoPushSenderOptions {
  readonly accessToken?: string;
}

export class ExpoPushSender extends PushSender {
  private readonly expo: Expo;

  constructor(options: ExpoPushSenderOptions = {}) {
    super();
    this.expo = new Expo(
      options.accessToken === undefined ? {} : { accessToken: options.accessToken },
    );
  }

  async send(messages: readonly PushMessage[]): Promise<PushTicket[]> {
    if (messages.length === 0) return [];
    let tickets: ExpoPushTicket[];
    try {
      tickets = await this.expo.sendPushNotificationsAsync(
        messages.map((message) => ({
          to: message.token,
          title: message.title,
          body: message.body,
          data: { ...message.data },
        })),
      );
    } catch (error) {
      throw classifyExpoError(error);
    }
    return tickets.map(toTicket);
  }

  async getReceipts(ticketIds: readonly string[]): Promise<ReadonlyMap<string, PushReceipt>> {
    const result = new Map<string, PushReceipt>();
    for (const chunk of this.expo.chunkPushNotificationReceiptIds([...ticketIds])) {
      let receipts: Record<string, ExpoPushReceipt>;
      try {
        receipts = await this.expo.getPushNotificationReceiptsAsync(chunk);
      } catch (error) {
        throw classifyExpoError(error);
      }
      for (const [id, receipt] of Object.entries(receipts)) {
        result.set(id, toReceipt(receipt));
      }
    }
    return result;
  }
}
