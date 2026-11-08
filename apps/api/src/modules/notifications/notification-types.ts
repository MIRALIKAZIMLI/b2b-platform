// Bildirim türleri ve outbox olayı → bildirim eşlemesi (US-054, F1.11).
// US-054 tablosundaki olaylar ilgili modüller yazıldıkça eklenir (her olay: tür, alıcılar, konu
// kimliği). Alıcılar olayı yazan modülde çözülür; olay alıcı başınadır (F2.9: yeni şablon sürümü).
import { z } from 'zod';

/** Tercih anahtarları ve şablon türleri. */
export const NOTIFICATION_TYPES = ['test', 'role_template_version'] as const;
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
]);

/** Bildirime dönüşen outbox olay türleri (`notifications` kuyruğu). */
export const NOTIFICATION_EVENT_TYPES: readonly string[] = [...EVENTS.keys()];

/** Olay yükünden bildirimleri üretir; bilinmeyen olayda boş liste. */
export function intentsForEvent(type: string, payload: unknown): NotificationIntent[] {
  return EVENTS.get(type)?.(payload) ?? [];
}
