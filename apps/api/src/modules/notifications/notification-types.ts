// Bildirim türleri ve outbox olayı → bildirim eşlemesi (US-054, F1.11).
// US-054 tablosundaki olaylar ilgili modüller yazıldıkça eklenir (her olay: tür, alıcılar, konu
// kimliği). Alıcılar olayı yazan modülde çözülür; olay alıcı başınadır (F2.9: yeni şablon sürümü).
import { z } from 'zod';

/** Tercih anahtarları ve şablon türleri. */
export const NOTIFICATION_TYPES = [
  'test',
  'role_template_version',
  'connection_request',
  'connection_accepted',
  'connection_rejected',
  'connection_cancelled',
  'connection_request_expired',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

const TYPE_SET: ReadonlySet<string> = new Set(NOTIFICATION_TYPES);

export function isNotificationType(value: string): value is NotificationType {
  return TYPE_SET.has(value);
}

/** Bir alıcıya gidecek bildirim (yalnızca kimlik, kod, sayı; kişisel veri yok). */
export interface NotificationIntent {
  readonly userId: string;
  readonly businessId: string | null;
  readonly type: NotificationType;
  /** Uygulamanın ayrıntıyı API'den çekeceği kayıt kimliği (`data.id`). */
  readonly subjectId: string;
  /** Şablon yer tutucuları (`{ad}`); yalnızca kod veya sayı. */
  readonly params: Readonly<Record<string, string | number>>;
}

const testPayload = z.object({ userId: z.uuid(), ref: z.uuid() });
const templateVersionPayload = z.object({
  templateId: z.uuid(),
  version: z.number().int(),
  businessId: z.uuid(),
  userId: z.uuid(),
});
const connectionRequestPayload = z.object({
  requestId: z.uuid(),
  sellerId: z.uuid(),
  buyerId: z.uuid(),
  userId: z.uuid(),
});

const connectionResponsePayload = z.object({
  requestId: z.uuid(),
  sellerId: z.uuid(),
  buyerId: z.uuid(),
  userId: z.uuid(),
});

/** İptal bildirimi; `businessId` alıcının (karşı tarafın) işletmesi. */
const connectionCancelNoticePayload = z.object({
  connectionId: z.uuid(),
  businessId: z.uuid(),
  userId: z.uuid(),
});

/**
 * Kabul / red / süre doldu bildirimi toptancı tarafına; konu istek kimliği (US-054 "İstek kabul /
 * red / süre doldu").
 */
function connectionResponseIntents(
  type: 'connection_accepted' | 'connection_rejected' | 'connection_request_expired',
): (payload: unknown) => NotificationIntent[] {
  return (payload: unknown) => {
    const event = connectionResponsePayload.parse(payload);
    return [
      {
        userId: event.userId,
        businessId: event.sellerId,
        type,
        subjectId: event.requestId,
        params: {},
      },
    ];
  };
}

/** Outbox olay türü → bildirimler. Yük outbox'ta zaten doğrulanmıştır; burada yeniden okunur. */
const EVENTS: ReadonlyMap<string, (payload: unknown) => NotificationIntent[]> = new Map([
  [
    'notification.test',
    (payload: unknown): NotificationIntent[] => {
      const event = testPayload.parse(payload);
      return [
        { userId: event.userId, businessId: null, type: 'test', subjectId: event.ref, params: {} },
      ];
    },
  ],
  [
    // F2.9 (US-012 AC2): işletme adminine "yeni şablon sürümü"; konu şablon kimliği.
    'role_template.version_published',
    (payload: unknown): NotificationIntent[] => {
      const event = templateVersionPayload.parse(payload);
      return [
        {
          userId: event.userId,
          businessId: event.businessId,
          type: 'role_template_version',
          subjectId: event.templateId,
          params: { version: event.version },
        },
      ];
    },
  ],
  [
    // F2.12a (US-021 AC1, US-054 "Yeni bağlantı isteği"): perakendeci adminine; konu istek
    // kimliği. Toptancının adı bildirime girmez (yalnız kod/sayı); uygulama isteği API'den açar.
    'connection.request_created',
    (payload: unknown): NotificationIntent[] => {
      const event = connectionRequestPayload.parse(payload);
      return [
        {
          userId: event.userId,
          businessId: event.buyerId,
          type: 'connection_request',
          subjectId: event.requestId,
          params: {},
        },
      ];
    },
  ],
  // F2.13a: perakendeci yanıtı; perakendecinin adı bildirime girmez (yalnız kod/sayı).
  ['connection.accepted', connectionResponseIntents('connection_accepted')],
  ['connection.rejected', connectionResponseIntents('connection_rejected')],
  // F2.16 (US-026 AC1): süre dolumu; perakendecinin adı bildirime girmez.
  ['connection.request_expired', connectionResponseIntents('connection_request_expired')],
  [
    // F2.15a (US-054 "Bağlantı iptal edildi"): karşı tarafın adminine; konu bağlantı kimliği.
    // İptal eden işletmenin adı ve gerekçesi (engel dahil) bildirime girmez (Mimar notu 3).
    'connection.cancel_notice',
    (payload: unknown): NotificationIntent[] => {
      const event = connectionCancelNoticePayload.parse(payload);
      return [
        {
          userId: event.userId,
          businessId: event.businessId,
          type: 'connection_cancelled',
          subjectId: event.connectionId,
          params: {},
        },
      ];
    },
  ],
]);

/** Bildirime dönüşen outbox olay türleri (`notifications` kuyruğu). */
export const NOTIFICATION_EVENT_TYPES: readonly string[] = [...EVENTS.keys()];

/** Olay yükünden bildirimleri üretir; bilinmeyen olayda boş liste. */
export function intentsForEvent(type: string, payload: unknown): NotificationIntent[] {
  return EVENTS.get(type)?.(payload) ?? [];
}
