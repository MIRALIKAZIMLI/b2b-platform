// Outbox olay kaydı (F1.2b): olay türü → BullMQ kuyruğu + yük alanları.
// Yük kişisel veri taşımaz (ADR-0010 §3): alan türleri yalnızca kimlik (uuid), sayı veya kod
// (sabit seçenek listesi) olabilir; serbest metin alanı tanımlanamaz. Bilinmeyen alan reddedilir.
// Bu adımda yalnızca test olayı var; gerçek olaylar ve kuyruklar modüllerle birlikte eklenir.
import { z } from 'zod';

/** Kuyruk adları. Yeni kuyruk, onu tüketen iş (F1.11 ve sonrası) ile birlikte eklenir. */
// `connections` (F2.16): bugün outbox olayı yok; zamanlanmış süre dolumu işi bu kuyruktadır.
// `catalog` (F3.4a): ürün görseli küçültme işi.
// `imports` (F3.5a): Excel içe aktarma doğrulaması ve önizleme süre dolumu.
export const OUTBOX_QUEUE_NAMES = [
  'test',
  'access',
  'notifications',
  'directory',
  'connections',
  'catalog',
  'imports',
] as const;
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
  // F3.4a (US-030 AC3): ürüne görsel eklendi. Tüketici `catalog` (worker küçültme işi; kart K11).
  // `businessIds` = [satıcı]; iş kiracı bağlamını oradan kurar.
  'product_image.added': { queue: 'catalog', fields: { imageId: 'id', productId: 'id' } },
  // F3.5a (US-031 AC2, SF-08): içe aktarma işi açıldı. Tüketici `imports` (worker doğrulama ve
  // önizleme; kart K15). `businessIds` = [satıcı]; iş kiracı bağlamını oradan kurar.
  'import.uploaded': { queue: 'imports', fields: { jobId: 'id' } },
  // F3.5c (US-031 AC3, SF-08): önizleme onaylandı. Tüketici `imports` (worker uygulama; kart K1).
  'import.apply_requested': { queue: 'imports', fields: { jobId: 'id' } },
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
  // F2.16 (US-026 AC1, US-054 "İstek süre doldu"): süre dolumu işi isteği `expired` yaptı;
  // isteği gönderen + satıcı adminlerinin her biri için bir olay (`userId` alıcı). Tüketici
  // `notifications`.
  'connection.request_expired': {
    queue: 'notifications',
    fields: { requestId: 'id', sellerId: 'id', buyerId: 'id', userId: 'id' },
  },
  // F2.13a/F2.15a (US-025, SF-07): bağlantı iptal edildi (API veya engel); bağlantı başına tek olay.
  // Sepet/sipariş etkileri olayla değil, aynı işlemdeki `ConnectionCancelledHandler` kancasıyla;
  // bu olay ileride önbellek tüketicileri (F3/F4) içindir, bugün bildirime dönüşmez.
  'connection.cancelled': {
    queue: 'notifications',
    fields: {
      connectionId: 'id',
      sellerId: 'id',
      buyerId: 'id',
      // F2.18: `platform` = arşivlenen perakendecinin bağlantısı (D2 = A).
      endedBySide: ['seller', 'buyer', 'platform'],
    },
  },
  // F2.15a (US-054 "Bağlantı iptal edildi"): karşı tarafın her aktif admini için bir olay (`userId`
  // alıcı, `businessId` alıcının işletmesi = karşı taraf). Gerekçe (engel dahil) ve iptal eden yüke
  // girmez (Mimar K2/notu 3: engel bilgisi sızmaz).
  'connection.cancel_notice': {
    queue: 'notifications',
    fields: { connectionId: 'id', businessId: 'id', userId: 'id' },
  },
  // F2.18 (US-016 AC2, D2 = A): arşivlenen perakendecinin bağlantısı platformca kapandı; toptancının
  // her aktif admini için bir olay (`userId` alıcı, `businessId` toptancı). Bildirim
  // `connection_closed_by_platform`.
  'connection.platform_closed_notice': {
    queue: 'notifications',
    fields: { connectionId: 'id', businessId: 'id', userId: 'id' },
  },
  // F2.18 (US-015 AC2): platform admini perakendecinin VÖEN'ini reddetti; perakendecinin her
  // aktif admini için bir olay (`userId` alıcı). Gerekçe sabit kod (serbest metin yok, §3).
  // Tüketici `notifications` (bildirim `voen_rejected`).
  'buyer.voen_rejected': {
    queue: 'notifications',
    fields: {
      businessId: 'id',
      userId: 'id',
      reason: ['voen_not_found', 'name_mismatch', 'voen_inactive', 'other'],
    },
  },
  // F2.17 (US-027 AC1): bağlantısız perakendeciye profil hatırlatması; perakendecinin her aktif
  // admini için bir olay (`userId` alıcı). Tüketici `notifications` (`dormant_profile_reminder`).
  'buyer.dormant_reminder': {
    queue: 'notifications',
    fields: { businessId: 'id', userId: 'id', stage: ['reminded_7', 'reminded_30'] },
  },
  // F2.17 (US-027 AC1): hizmet bölgesi eşleşen toptancının her aktif admini için "bölgede yeni
  // perakendeci" (`businessId` toptancı, `buyerId` perakendeci). Bildirim `new_buyer_in_region`.
  'buyer.dormant_new_buyer': {
    queue: 'notifications',
    fields: { buyerId: 'id', businessId: 'id', userId: 'id' },
  },
  // F2.17 (US-027 AC2): "hesabınız N gün sonra pasifleşecek"; perakendecinin her aktif admini için
  // bir olay. `days` = `dormant.deactivate_day − dormant.warning_day`. Bildirim `dormant_warning`.
  'buyer.dormant_warning': {
    queue: 'notifications',
    fields: { businessId: 'id', userId: 'id', days: 'integer' },
  },
  // F3.2a (US-029 AC2, kart K5): admin marka talebini onayladı / reddetti; talebi gönderen (hâlâ
  // aktif üyeyse) ve toptancının aktif adminleri için birer olay (`userId` alıcı, `businessId`
  // toptancı). Marka adı serbest metin olduğu için yüke girmez; uygulama talebi API'den açar.
  'brand.request_decided': {
    queue: 'notifications',
    fields: { brandId: 'id', businessId: 'id', userId: 'id', decision: ['approved', 'rejected'] },
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
