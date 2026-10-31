// SMS gönderici portu (integrations.md §2, NFR-95, ADR-0008). Uygulama kodu hangi sağlayıcının
// kullanıldığını bilmez; sağlayıcı `SMS_PROVIDER` ile seçilir (infrastructure/sms).
// Nest sağlayıcısı: `@Inject(SmsSender)` (SmsModule, global).

export interface SmsMessage {
  /** E.164, ör. `+994501234567`. */
  readonly to: string;
  readonly body: string;
  /** `invitation`: davet / aktivasyon bağlantısı (F2.1a, D18 güncellemesi). */
  readonly purpose: 'otp' | 'invitation';
}

export interface SmsSendResult {
  readonly providerMessageId: string;
}

export abstract class SmsSender {
  /** Gönderemezse hata atar; çağıran kullanıcıya `SMS_UNAVAILABLE` döner. */
  abstract send(message: SmsMessage): Promise<SmsSendResult>;
}
