// Outbox olay kaydı (F1.2b): olay türü → BullMQ kuyruğu + yük alanları.
// Yük kişisel veri taşımaz (ADR-0010 §3): alan türleri yalnızca kimlik (uuid), sayı veya kod
// (sabit seçenek listesi) olabilir; serbest metin alanı tanımlanamaz. Bilinmeyen alan reddedilir.
// Bu adımda yalnızca test olayı var; gerçek olaylar ve kuyruklar modüllerle birlikte eklenir.
import { z } from 'zod';

/** Kuyruk adları. Yeni kuyruk, onu tüketen iş (F1.11 ve sonrası) ile birlikte eklenir. */
export const OUTBOX_QUEUE_NAMES = ['test', 'access', 'notifications', 'directory'] as const;
export type OutboxQueueName = (typeof OUTBOX_QUEUE_NAMES)[number];

/** Serbest metin olmayan alan türleri. Kod alanı, seçenek listesiyle (`['a', 'b']`) tanımlanır. */
export const PAYLOAD_FIELD_KINDS = ['id', 'integer', 'number'] as const;
type ScalarKind = (typeof PAYLOAD_FIELD_KINDS)[number];
export type PayloadFieldKind = ScalarKind | readonly [string, ...string[]];

export interface OutboxEventDefinition {
  readonly queue: OutboxQueueName;
  readonly fields: Readonly<Record<string, PayloadFieldKind>>;
}

export const OUTBOX_EVENTS = {
  // Yalnızca testler için (F1.2b). Tüketicisi yok.
  'test.ping': { queue: 'test', fields: { ref: 'id', count: 'integer' } },
  // F1.8a: üyelik rolü değişti. Tüketici F1.8b (izin önbelleği temizliği).
  'membership.role_changed': {
    queue: 'access',
    fields: { membershipId: 'id', userId: 'id', oldRoleId: 'id', newRoleId: 'id' },
  },
  // F2.8 (R22): özel rolün izinleri değişti; rolün her aktif üyeliği için bir olay. Tüketici
  // `access` (izin önbelleği silme; API commit sonrası da siler, bu iş yedektir).
  'role.permissions_changed': {
    queue: 'access',
    fields: { roleId: 'id', membershipId: 'id', version: 'integer' },
  },
  // F1.11: bildirim altyapısının test olayı (US-054 AC1 altyapı). `userId` alıcı, `ref` konu kimliği.
  'notification.test': { queue: 'notifications', fields: { userId: 'id', ref: 'id' } },
  // F2.3a: perakendeci kaydoldu (SF-02). Tüketici `directory` (F2.11a, dizin indeksi).
  'buyer.registered': { queue: 'directory', fields: { businessId: 'id', regionId: 'id' } },
  // F2.10 (US-007): perakendecinin görünürlük ayarları değişti. Tüketici `directory` (F2.11a;
  // indeksteki açık alanları yeniler, "dizinde görünme" kapalıysa indeksten çıkarır).
  'buyer.privacy_changed': { queue: 'directory', fields: { businessId: 'id' } },
  // F2.11a (Müfettiş 15 L4, VARSAYIM K3): perakendecinin dizinde görünebilen profil alanı
  // (ünvan, bölge, faaliyet alanı, adres, işletme telefonu, VÖEN, yetkili adı, logo) değişti.
  // Yükte yalnız kimlik; tüketici `directory` belgeyi D fonksiyonundan yeniden okur.
  'buyer.profile_changed': { queue: 'directory', fields: { businessId: 'id' } },
  // F2.9 (US-012 AC2): platform rol şablonunun izinleri değişti (yeni sürüm). Şablondan rolü olan
  // işletmenin her aktif admini için bir olay; tüketici `notifications` (bildirim).
  'role_template.version_published': {
    queue: 'notifications',
    fields: { templateId: 'id', version: 'integer', businessId: 'id', userId: 'id' },
  },
  // F2.12a (US-021 AC1, US-054): yeni bağlantı isteği; perakendecinin her aktif admini için bir
  // olay (`userId` alıcı). Tüketici `notifications` (bildirim). İstek süresi F2.16, kabul F2.13.
  'connection.request_created': {
    queue: 'notifications',
    fields: { requestId: 'id', sellerId: 'id', buyerId: 'id', userId: 'id' },
  },
  // F2.13a (US-023 AC2, US-054 "İstek kabul"): isteği gönderen + satıcı adminlerinin her biri için
  // bir olay (`userId` alıcı). Tüketici `notifications`.
  'connection.accepted': {
    queue: 'notifications',
    fields: { requestId: 'id', connectionId: 'id', sellerId: 'id', buyerId: 'id', userId: 'id' },
  },
  // F2.13a (US-023 AC3–AC4, US-054 "İstek red"): red veya engel; alıcılar kabul ile aynı.
  'connection.rejected': {
    queue: 'notifications',
    fields: { requestId: 'id', sellerId: 'id', buyerId: 'id', userId: 'id' },
  },
  // F2.13a (US-023 AC4): engel aktif bağlantıyı kapattı; bağlantı başına tek olay. Bildirimi ve
  // sepet/sipariş tüketicisi (`ConnectionCancelledHandler`) F2.15'te; o zamana kadar atlanır.
  'connection.cancelled': {
    queue: 'notifications',
    fields: { connectionId: 'id', sellerId: 'id', buyerId: 'id', endedBySide: ['seller', 'buyer'] },
  },
} as const satisfies Record<string, OutboxEventDefinition>;

export type OutboxEventType = keyof typeof OUTBOX_EVENTS;

type FieldValue<K> = K extends 'id'
  ? string
  : K extends 'integer' | 'number'
    ? number
    : K extends readonly string[]
      ? K[number]
      : never;

type FieldsOf<T extends OutboxEventType> = (typeof OUTBOX_EVENTS)[T]['fields'];

export type OutboxPayload<T extends OutboxEventType> = {
  readonly [F in keyof FieldsOf<T>]: FieldValue<FieldsOf<T>[F]>;
};

function fieldSchema(kind: PayloadFieldKind): z.ZodType {
  if (typeof kind !== 'string') return z.enum(kind);
  switch (kind) {
    case 'id':
      return z.uuid();
    case 'integer':
      return z.number().int();
    case 'number':
      return z.number();
  }
}

function payloadSchema(definition: OutboxEventDefinition): z.ZodType {
  const shape: Record<string, z.ZodType> = {};
  for (const [field, kind] of Object.entries(definition.fields)) {
    shape[field] = fieldSchema(kind);
  }
  return z.strictObject(shape);
}

export interface ResolvedOutboxEvent extends OutboxEventDefinition {
  readonly payloadSchema: z.ZodType;
}

const RESOLVED: ReadonlyMap<string, ResolvedOutboxEvent> = new Map(
  Object.entries(OUTBOX_EVENTS).map(([type, definition]) => [
    type,
    { ...definition, payloadSchema: payloadSchema(definition) },
  ]),
);

/** Olay türünün tanımı; bilinmeyen türde undefined. */
export function outboxEventDefinition(type: string): ResolvedOutboxEvent | undefined {
  return RESOLVED.get(type);
}

/** Kayıtta olmayan olay türü (dağıtımda olaya özgü hata sayılır). */
export class UnknownOutboxEventError extends Error {
  override readonly name = 'UnknownOutboxEventError';

  constructor() {
    super('Bilinmeyen outbox olay türü');
  }
}
