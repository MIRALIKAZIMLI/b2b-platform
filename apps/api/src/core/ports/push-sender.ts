// Push gönderici portu (integrations.md §3, ADR-0008). Uygulama kodu hangi sağlayıcının
// kullanıldığını bilmez; sağlayıcı `PUSH_PROVIDER` ile seçilir (infrastructure/push, yalnızca worker).
// İçerik kişisel veri taşımaz: yalnızca başlık, kısa metin ve `data: { type, id }`.
// Nest sağlayıcısı: `@Inject(PushSender)` (PushModule, global).

export interface PushMessage {
  /** `ExponentPushToken[...]` */
  readonly token: string;
  readonly title: string;
  readonly body: string;
  readonly data: Readonly<Record<string, string>>;
}

/** Sağlayıcının kalıcı hata kodları (Expo `details.error`). */
export type PushErrorCode =
  | 'DeviceNotRegistered'
  | 'InvalidCredentials'
  | 'MessageTooBig'
  | 'MessageRateExceeded'
  | 'DeveloperError'
  | 'ExpoError'
  | 'ProviderError'
  | 'Unknown';

/** Mesaj başına bilet (gönderilen sırayla). */
export type PushTicket =
  | { readonly status: 'ok'; readonly ticketId: string }
  | { readonly status: 'error'; readonly error: PushErrorCode };

/** Makbuz; bilinmeyen (henüz hazır olmayan) bilet sonuçta yer almaz. */
export type PushReceipt =
  { readonly status: 'ok' } | { readonly status: 'error'; readonly error: PushErrorCode };

/** Geçici hata (ağ, HTTP 429/5xx): çağıran `push.retry_delays_minutes` ile yeniden dener. */
export class PushTransientError extends Error {
  override readonly name = 'PushTransientError';

  constructor() {
    super('Push sağlayıcısına geçici olarak ulaşılamadı');
  }
}

/** Kalıcı hata (ör. geçersiz kimlik bilgisi): yeniden denenmez. */
export class PushPermanentError extends Error {
  override readonly name = 'PushPermanentError';

  constructor() {
    super('Push sağlayıcısı isteği reddetti');
  }
}

export abstract class PushSender {
  /** Bir grup mesaj (en fazla 100); biletler mesaj sırasıyla döner. */
  abstract send(messages: readonly PushMessage[]): Promise<PushTicket[]>;
  /** Bilet kimliklerinin makbuzları (kimlik → makbuz). */
  abstract getReceipts(ticketIds: readonly string[]): Promise<ReadonlyMap<string, PushReceipt>>;
}
