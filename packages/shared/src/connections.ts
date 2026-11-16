// Bağlantı isteği sözleşmesi (F2.12a; openapi `POST /api/v1/connection-requests`,
// `GET /api/v1/connection-requests/outgoing`, şema `ConnectionRequest`). İstemci ve sunucu ortak.
import { z } from 'zod';
import { pickLocalizedText } from './localized-text';
import type { CurrencyFormat } from './format';

export const CONNECTION_REQUEST_MESSAGE_MAX = 500;
export const CONNECTION_REQUEST_TERM_MAX_DAYS = 180;
export const CONNECTION_REQUEST_PAGE_MAX = 50;

export const CONNECTION_REQUEST_STATUSES = [
  'pending',
  'accepted',
  'rejected',
  'expired',
  'withdrawn',
] as const;
export type ConnectionRequestStatus = (typeof CONNECTION_REQUEST_STATUSES)[number];

/** İstek gövdesi; boş (yalnız boşluk) mesaj gönderilmemiş sayılır. */
export const connectionRequestCreateSchema = z
  .object({
    buyerId: z.uuid(),
    message: z
      .string()
      .trim()
      .max(CONNECTION_REQUEST_MESSAGE_MAX)
      .optional()
      .transform((value) => (value === undefined || value === '' ? undefined : value)),
    proposedPaymentTermDays: z
      .number()
      .int()
      .min(0)
      .max(CONNECTION_REQUEST_TERM_MAX_DAYS)
      .optional(),
  })
  .strict();
export type ConnectionRequestCreate = z.infer<typeof connectionRequestCreateSchema>;

export const outgoingConnectionRequestsQuerySchema = z
  .object({
    status: z.enum(CONNECTION_REQUEST_STATUSES).optional(),
    cursor: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(CONNECTION_REQUEST_PAGE_MAX).default(20),
  })
  .strict();
export type OutgoingConnectionRequestsQuery = z.infer<typeof outgoingConnectionRequestsQuerySchema>;

/** openapi `ConnectionRequest`. */
export interface ConnectionRequestView {
  readonly id: string;
  readonly sellerId: string;
  readonly buyerId: string;
  readonly status: ConnectionRequestStatus;
  readonly message: string | null;
  readonly proposedPaymentTermDays: number | null;
  readonly expiresAt: string;
  readonly createdAt: string;
}

/** Gönderilen istek: perakendecinin ünvanı (dizinde her zaman açık; işletme kapandıysa null). */
export interface OutgoingConnectionRequest extends ConnectionRequestView {
  readonly buyerName: string | null;
}

export interface OutgoingConnectionRequestPage {
  readonly items: readonly OutgoingConnectionRequest[];
  readonly nextCursor: string | null;
}

// ---- İsteğe yanıt, geri çekme, engel (F2.13a; US-022, US-023) ----

/** `POST /connection-requests/{id}/accept` gövdesi: veri paylaşım uyarısı onaylandı (US-023 AC2). */
export const connectionAcceptSchema = z.object({ confirmDataSharing: z.literal(true) }).strict();
export type ConnectionAccept = z.infer<typeof connectionAcceptSchema>;

export const incomingConnectionRequestsQuerySchema = z
  .object({
    cursor: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(CONNECTION_REQUEST_PAGE_MAX).default(20),
  })
  .strict();
export type IncomingConnectionRequestsQuery = z.infer<typeof incomingConnectionRequestsQuerySchema>;

/** Perakendecinin gördüğü toptancı özeti (US-023 AC1): ürün, fiyat, başka bağlantı yok. */
export interface ConnectionSellerSummary {
  readonly id: string;
  readonly name: string;
  readonly logoUrl: string | null;
  /** Tanıtım metni (dil → metin); yoksa null. */
  readonly description: Readonly<Record<string, string>> | null;
  /**
   * Toptancının kategorileri (F3.3a, S3 = A): `active` ürünlerinin aktif kök kategorileri, sıra
   * numarasıyla; ürünü olmayan toptancıda boş.
   */
  readonly categories: readonly ConnectionSellerCategory[];
}

export interface ConnectionSellerCategory {
  readonly id: string;
  readonly name: Readonly<Record<string, string>>;
}

/** Gelen bekleyen istek: mesaj ve önerilen vade `ConnectionRequestView`'da. */
export interface IncomingConnectionRequest extends ConnectionRequestView {
  readonly seller: ConnectionSellerSummary;
}

export interface IncomingConnectionRequestPage {
  readonly items: readonly IncomingConnectionRequest[];
  readonly nextCursor: string | null;
}

/**
 * openapi `ConnectionTerms`; `creditLimit` ondalık metin (para, `numeric`). Alıcı bakışında yalnız
 * `creditLimit` ve `paymentTermDays` döner (F2.14a K5); satıcıya özgü alanlar yoktur.
 */
export interface ConnectionTermsView {
  readonly priceListId?: string | null;
  readonly branchPricingEnabled?: boolean;
  readonly creditLimit: string | null;
  readonly paymentTermDays: number;
  readonly salesRepMembershipId?: string | null;
}

/**
 * Koşul ekranının öneri değerleri (US-024 AC3; F2.14a K4), yalnız satıcı bakışında ve koşul henüz
 * atanmamışken: önce aynı çiftin önceki (iptal edilmiş) bağlantısının atanmış koşulları, yoksa
 * isteğin önerilen vadesi. Bağlantıya yazılmaz (kabulde vade 0, kullanıcı kararı 2026-11-10).
 */
export interface ConnectionTermsSuggestion {
  readonly source: 'previous_connection' | 'request';
  readonly creditLimit: string | null;
  readonly paymentTermDays: number;
  /** Önceki temsilci hâlâ aktif üyeyse; değilse null. */
  readonly salesRepMembershipId: string | null;
}

/** openapi `Connection`. */
export interface ConnectionView {
  readonly id: string;
  readonly sellerId: string;
  readonly buyerId: string;
  /** Karşı tarafın ünvanı; karşı taraf artık görünmüyorsa (kapalı işletme) null. */
  readonly counterpartyName: string | null;
  readonly status: ConnectionStatus;
  /** Satıcı koşulları bir kez kaydetti mi (US-024 AC1 "koşul atanmadı")? */
  readonly termsAssigned: boolean;
  readonly terms: ConnectionTermsView;
  /** Yalnız satıcı bakışında, koşul atanmamışken; öneri yoksa null. */
  readonly suggestedTerms?: ConnectionTermsSuggestion | null;
  readonly startedAt: string;
  readonly endedAt: string | null;
  /** `platform` = perakendecinin hesabı platformca kapatıldı (F2.18, US-016 AC2). */
  readonly endedBySide: ConnectionEndedBySide | null;
}

export const CONNECTION_ENDED_BY_SIDES = ['seller', 'buyer', 'platform'] as const;
export type ConnectionEndedBySide = (typeof CONNECTION_ENDED_BY_SIDES)[number];

/**
 * İptal edilmiş bağlantıda "kim kapattı" metninin anahtar soneki (web + mobil, `customers.row.*`).
 * Platform kapatması karşı taraf iptali gibi gösterilmez (F2.18, Müfettiş 22 M1).
 */
export function connectionEndedLabel(
  endedBySide: ConnectionEndedBySide,
  viewerSide: 'seller' | 'buyer',
): 'ended_by_you' | 'ended_by_other' | 'ended_by_platform' {
  if (endedBySide === 'platform') return 'ended_by_platform';
  return endedBySide === viewerSide ? 'ended_by_you' : 'ended_by_other';
}

// ---- Bağlantı listesi ve koşullar (F2.14a; US-024) ----

export const CONNECTION_STATUSES = ['active', 'cancelled'] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];
export const CONNECTION_PAGE_MAX = 50;

export const connectionsQuerySchema = z
  .object({
    status: z.enum(CONNECTION_STATUSES).optional(),
    cursor: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(CONNECTION_PAGE_MAX).default(20),
  })
  .strict();
export type ConnectionsQuery = z.infer<typeof connectionsQuerySchema>;

/** `GET /connections/sales-reps` (F2.14b): temsilci seçeneği = satıcının aktif üyesi. */
export interface SalesRepOption {
  readonly membershipId: string;
  readonly fullName: string;
}

export interface SalesRepList {
  readonly items: readonly SalesRepOption[];
}

export interface ConnectionPage {
  readonly items: readonly ConnectionView[];
  readonly nextCursor: string | null;
}

/** Kredi limiti: AZN, negatif değil, en çok 2 ondalık, `numeric(14,2)` sınırında. */
export const CREDIT_LIMIT_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;

/**
 * `PATCH /connections/{id}/terms` gövdesi (kısmi). Fiyat listesi ve şube fiyatı F3.6'ya kadar
 * kapalıdır (F2.14a K3): `priceListId` yalnız null, `branchPricingEnabled` yalnız false.
 */
export const connectionTermsUpdateSchema = z
  .object({
    priceListId: z.null().optional(),
    branchPricingEnabled: z.literal(false).optional(),
    creditLimit: z.string().regex(CREDIT_LIMIT_PATTERN).nullable().optional(),
    paymentTermDays: z.number().int().min(0).max(CONNECTION_REQUEST_TERM_MAX_DAYS).optional(),
    salesRepMembershipId: z.uuid().nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'empty_terms' });
export type ConnectionTermsUpdate = z.infer<typeof connectionTermsUpdateSchema>;

// ---- Bağlantı iptali (F2.15a; US-025, SF-07) ----

/** İptal gerekçeleri (openapi `/connections/{id}/cancel`). Engel `blocked` sunucuda yazılır. */
export const CONNECTION_CANCEL_REASONS = [
  'no_longer_working',
  'payment_issue',
  'quality_issue',
  'other',
] as const;
export type ConnectionCancelReason = (typeof CONNECTION_CANCEL_REASONS)[number];
export const CONNECTION_CANCEL_NOTE_MAX = 500;

/**
 * `POST /connections/{id}/cancel` gövdesi. `confirm: true` ikinci onaydır; yoksa API bu şemadan
 * önce `422 CONFIRMATION_REQUIRED` döner (SF-07).
 */
export const connectionCancelSchema = z
  .object({
    reason: z.enum(CONNECTION_CANCEL_REASONS),
    note: z.string().trim().max(CONNECTION_CANCEL_NOTE_MAX).optional(),
    confirm: z.literal(true),
  })
  .strict();
export type ConnectionCancelInput = z.infer<typeof connectionCancelSchema>;

/** İstemcinin gönderdiği gövde (openapi ile aynı; `note` yoksa alan hiç yok). */
export interface ConnectionCancelBody {
  readonly reason: ConnectionCancelReason;
  readonly note?: string;
  readonly confirm: true;
}

export interface ConnectionCancelResult {
  /** İptal edilen `submitted` sipariş sayısı (F4.5'e kadar 0). */
  readonly cancelledOrders: number;
}

export const blockCreateSchema = z.object({ sellerId: z.uuid() }).strict();
export type BlockCreate = z.infer<typeof blockCreateSchema>;

/** Engellenen toptancı (perakendecinin "Engellenenler" listesi). */
export interface BlockedSeller {
  readonly sellerId: string;
  readonly sellerName: string;
  readonly logoUrl: string | null;
  readonly createdAt: string;
}

export interface BlockedSellerList {
  readonly items: readonly BlockedSeller[];
}

// ---- Ekran yardımcıları (F2.12b) ----

/** openapi `DirectoryBuyer.relation`: bu satıcıyla ilişki (yalnız çağıranın satırlarından). */
export interface ConnectionRelation {
  readonly status: 'none' | 'pending' | 'active' | 'rejected' | 'cancelled' | 'blocked';
  readonly cooldownUntil: string | null;
  readonly canRequest: boolean;
}

/**
 * Dizin kartının ilişki görünümü. `send` dışındaki her durumda istek düğmesi yoktur. Sıra API ile
 * aynı (SF-03): aktif → bekleyen → engel → bekleme süresi.
 */
export type RelationView =
  | { readonly kind: 'send' }
  | { readonly kind: 'pending' }
  | { readonly kind: 'active' }
  | { readonly kind: 'blocked' }
  | { readonly kind: 'cooldown'; readonly until: string }
  | { readonly kind: 'unavailable' };

export function relationView(relation: ConnectionRelation): RelationView {
  if (relation.status === 'active') return { kind: 'active' };
  if (relation.status === 'pending') return { kind: 'pending' };
  if (relation.status === 'blocked') return { kind: 'blocked' };
  if (relation.canRequest) return { kind: 'send' };
  if (relation.cooldownUntil !== null) return { kind: 'cooldown', until: relation.cooldownUntil };
  return { kind: 'unavailable' };
}

/**
 * Ekranın kendi metniyle (`connections.error.<kod>`) gösterdiği hata kodları; diğerleri genel
 * `errors.<kod>` çevirisiyle.
 */
export const CONNECTION_REQUEST_ERROR_CODES = [
  'CONNECTION_REQUEST_ALREADY_PENDING',
  'CONNECTION_ALREADY_ACTIVE',
  'CONNECTION_BLOCKED',
  'CONNECTION_COOLDOWN_ACTIVE',
  'CONNECTION_DAILY_QUOTA_EXCEEDED',
  'SUBSCRIPTION_READ_ONLY',
  'NOT_FOUND',
  // Müfettiş 17 #59 L3: ağ kopunca istek sunucuda oluşmuş olabilir; metin listeyi gösterir.
  'IDEMPOTENCY_CONFLICT',
] as const;

/** Bu kodlar kartın ilişki durumunun eskidiğini gösterir: dizin yeniden yüklenir. */
const RELATION_CHANGED: ReadonlySet<string> = new Set([
  'CONNECTION_REQUEST_ALREADY_PENDING',
  'CONNECTION_ALREADY_ACTIVE',
  'CONNECTION_BLOCKED',
  'CONNECTION_COOLDOWN_ACTIVE',
  'NOT_FOUND',
  'IDEMPOTENCY_CONFLICT',
]);

export interface WaitTime {
  readonly hours: number;
  readonly minutes: number;
}

/** Saniye → saat + dakika; dakika yukarı yuvarlanır, en az 1 dakika (US-021 AC6). */
export function waitTimeOf(seconds: number): WaitTime {
  const total = Math.max(1, Math.ceil(seconds / 60));
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}

export interface ConnectionRequestFailure {
  readonly code: string;
  /** Ekranın kendi metni var mı (`connections.error.<kod>`); yoksa `errors.<kod>`. */
  readonly known: boolean;
  /** `CONNECTION_COOLDOWN_ACTIVE`: bekleme süresinin bitişi (US-021 AC5). */
  readonly cooldownUntil: string | null;
  /** `CONNECTION_DAILY_QUOTA_EXCEEDED`: satıcının gece yarısına kalan süre (US-021 AC6). */
  readonly wait: WaitTime | null;
  /** Kart durumu eskidi: dizin yenilenmeli. */
  readonly relationChanged: boolean;
}

function detailOf(body: object, key: string): unknown {
  const details = 'details' in body ? body.details : undefined;
  return typeof details === 'object' && details !== null && key in details
    ? (details as Record<string, unknown>)[key]
    : undefined;
}

/** API hata gövdesi → ekran görünümü. Gövde yoksa (ağ hatası) `INTERNAL_ERROR`. */
export function connectionRequestFailure(body: unknown): ConnectionRequestFailure {
  const object = typeof body === 'object' && body !== null ? body : {};
  const code = 'code' in object && typeof object.code === 'string' ? object.code : 'INTERNAL_ERROR';
  const until = detailOf(object, 'cooldownUntil');
  const retryAfter = detailOf(object, 'retryAfter');
  const cooldownUntil =
    code === 'CONNECTION_COOLDOWN_ACTIVE' && typeof until === 'string' ? until : null;
  const wait =
    code === 'CONNECTION_DAILY_QUOTA_EXCEEDED' && typeof retryAfter === 'number'
      ? waitTimeOf(retryAfter)
      : null;
  const listed = (CONNECTION_REQUEST_ERROR_CODES as readonly string[]).includes(code);
  const known =
    listed &&
    (code !== 'CONNECTION_COOLDOWN_ACTIVE' || cooldownUntil !== null) &&
    (code !== 'CONNECTION_DAILY_QUOTA_EXCEEDED' || wait !== null);
  return { code, known, cooldownUntil, wait, relationChanged: RELATION_CHANGED.has(code) };
}

/** Hata mesajının çeviri anahtarı ve yer tutucu değerleri (`{hours}`, `{minutes}`, `{date}`). */
export interface ConnectionFailureMessage {
  readonly key: string;
  readonly hours?: number;
  readonly minutes?: number;
  /** Ham ISO zaman; çağıran kendi dili ve saat dilimiyle `{date}` olarak biçimler. */
  readonly until?: string;
}

export function connectionFailureMessage(
  failure: ConnectionRequestFailure,
): ConnectionFailureMessage {
  if (!failure.known) return { key: `errors.${failure.code}` };
  if (failure.wait !== null) {
    return failure.wait.hours > 0
      ? { key: 'connections.error.quota_hours', ...failure.wait }
      : { key: 'connections.error.quota_minutes', minutes: failure.wait.minutes };
  }
  if (failure.cooldownUntil !== null) {
    return { key: `connections.error.${failure.code}`, until: failure.cooldownUntil };
  }
  return { key: `connections.error.${failure.code}` };
}

/** Vade kutusu (web + mobil): boş → `undefined` (gönderilmez); 0–180 tam sayı değilse `invalid`. */
export function parseTermDays(raw: string): number | undefined | 'invalid' {
  const value = raw.trim();
  if (value === '') return undefined;
  if (!/^\d{1,3}$/.test(value)) return 'invalid';
  const days = Number(value);
  return days <= CONNECTION_REQUEST_TERM_MAX_DAYS ? days : 'invalid';
}

// ---- Yanıt, geri çekme ve engel ekranları (F2.13b; US-022, US-023) ----

/** Kabul / red / engel / geri çekme hatasında ekranın kendi metniyle gösterdiği kodlar. */
export const CONNECTION_RESPOND_ERROR_CODES = [
  'CONNECTION_REQUEST_EXPIRED',
  'INVALID_STATE_TRANSITION',
  'CONNECTION_ALREADY_ACTIVE',
  'NOT_FOUND',
] as const;

export interface RespondFailure {
  /** Çeviri anahtarı: `connections.respond_error.<kod>` ya da genel `errors.<kod>`. */
  readonly key: string;
  /** İstek artık bekleyen değil (süre doldu, yanıtlandı, geri çekildi): liste yenilenmeli. */
  readonly refresh: boolean;
}

/** Yanıt uçlarının hata gövdesi → mesaj anahtarı. Gövde yoksa (ağ hatası) `INTERNAL_ERROR`. */
export function respondFailure(body: unknown): RespondFailure {
  const object = typeof body === 'object' && body !== null ? body : {};
  const code = 'code' in object && typeof object.code === 'string' ? object.code : 'INTERNAL_ERROR';
  const known = (CONNECTION_RESPOND_ERROR_CODES as readonly string[]).includes(code);
  return {
    key: known ? `connections.respond_error.${code}` : `errors.${code}`,
    refresh: known,
  };
}

/** Gelen istek kartının izinleri (US-023 AC6): satın alma sorumlusu yalnız görür. */
export interface IncomingAccess {
  readonly view: boolean;
  readonly respond: boolean;
  readonly block: boolean;
}

export function incomingAccess(codes: readonly string[]): IncomingAccess {
  const has = (code: string) => codes.includes(code);
  return {
    view: has('connections.view'),
    respond: has('connections.request.respond'),
    block: has('connections.block'),
  };
}

/** Ünvanın baş harfleri (logo yoksa); en çok iki harf. */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter((part) => part !== '')
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase())
    .join('');
}

/** Gelen istek kartının görünüm modeli (US-023 AC1): yalnız özet alanları; ürün ve fiyat yok. */
export interface IncomingCardView {
  readonly id: string;
  readonly sellerId: string;
  readonly sellerName: string;
  readonly initials: string;
  readonly logoUrl: string | null;
  /** Kullanıcının dilinde tanıtım; yoksa sırayla diğer diller; hiç yoksa null. */
  readonly description: string | null;
  readonly message: string | null;
  readonly termDays: number | null;
  readonly expiresAt: string | null;
}

/** Üretilmiş istemci tipinde istek alanları isteğe bağlı; görünüm yalnız bunları okur. */
export interface IncomingCardInput {
  readonly id?: string;
  readonly message?: string | null;
  readonly proposedPaymentTermDays?: number | null;
  readonly expiresAt?: string;
  readonly seller: ConnectionSellerSummary;
}

export function incomingCardView(item: IncomingCardInput, lang: string): IncomingCardView {
  const description =
    item.seller.description === null ? undefined : pickLocalizedText(item.seller.description, lang);
  return {
    id: item.id ?? '',
    sellerId: item.seller.id,
    sellerName: item.seller.name,
    initials: initialsOf(item.seller.name),
    logoUrl: item.seller.logoUrl,
    description: description ?? null,
    message: item.message ?? null,
    termDays: item.proposedPaymentTermDays ?? null,
    expiresAt: item.expiresAt ?? null,
  };
}

/** Push dokunuşunun açacağı ekran: alan + alan içindeki adres (menü `path`'i ile aynı). */
export interface PushTarget {
  readonly area: 'seller' | 'buyer';
  readonly path: string;
}

const PUSH_TARGETS: Readonly<Record<string, readonly PushTarget[]>> = {
  // Perakendeciye yeni istek (US-054) → gelen istekler.
  connection_request: [{ area: 'buyer', path: 'incoming-requests' }],
  // Toptancıya yanıt → gönderilen istekler.
  connection_accepted: [{ area: 'seller', path: 'requests' }],
  connection_rejected: [{ area: 'seller', path: 'requests' }],
  // F2.16: süre dolumu toptancıya → gönderilen istekler.
  connection_request_expired: [{ area: 'seller', path: 'requests' }],
  // F2.15b: iptal karşı tarafa gider; alan seçili işletmeden (perakendeci → toptancılarım,
  // toptancı → müşteriler).
  connection_cancelled: [
    { area: 'buyer', path: 'suppliers' },
    { area: 'seller', path: 'customers' },
  ],
  // F2.17 (US-027): bağlantısız perakendeciye hatırlatma ve uyarı → profil; toptancıya bölgede
  // yeni perakendeci → dizin.
  dormant_profile_reminder: [{ area: 'buyer', path: 'profile' }],
  dormant_warning: [{ area: 'buyer', path: 'profile' }],
  new_buyer_in_region: [{ area: 'seller', path: 'directory' }],
};

/**
 * Push `data` (`{ type, id }`) → ekran; bilinmeyen tür veya bozuk veri `undefined`. Alan verilirse
 * yalnız o alanın hedefi; verilmezse ilk hedef.
 */
export function pushRoute(data: unknown, area?: PushTarget['area']): PushTarget | undefined {
  if (typeof data !== 'object' || data === null || !('type' in data)) return undefined;
  const type = data.type;
  if (typeof type !== 'string' || !Object.hasOwn(PUSH_TARGETS, type)) return undefined;
  const targets = PUSH_TARGETS[type] ?? [];
  return area === undefined ? targets[0] : targets.find((target) => target.area === area);
}

/** Gönderilen isteğin ardından dizin kartının ilişkisi (sunucu yanıtıyla aynı). */
const PENDING_RELATION: ConnectionRelation = {
  status: 'pending',
  cooldownUntil: null,
  canRequest: false,
};

function markItems(items: unknown, buyerId: string): unknown {
  if (!Array.isArray(items)) return items;
  return items.map((item: unknown) =>
    typeof item === 'object' && item !== null && 'id' in item && item.id === buyerId
      ? { ...item, relation: PENDING_RELATION }
      : item,
  );
}

/**
 * Müfettiş 17 #59 L4: istek başarıyla gidince dizin önbelleğindeki kart yerinde "Gözləyir" olur;
 * arama yeniden çalışmaz (hız sınırından hak harcanmaz). Sayfalı (`pages`) ve tek sayfa (`items`)
 * önbellek biçimlerini değiştirmeden kopyalar.
 */
export function withPendingRelation<T>(data: T, buyerId: string): T {
  if (typeof data !== 'object' || data === null) return data;
  if ('pages' in data && Array.isArray(data.pages)) {
    return {
      ...data,
      pages: data.pages.map((page: unknown) => withPendingRelation(page, buyerId)),
    };
  }
  if ('items' in data) return { ...data, items: markItems(data.items, buyerId) };
  return data;
}

// ---- Toptancı müşteri ekranı ve koşul penceresi (F2.14b; US-024) ----

/** Kredi limiti para birimi: MVP tek para birimi AZN (US-024 AC2, data-model `credit_limit`). */
export const CREDIT_LIMIT_CURRENCY: CurrencyFormat = { code: 'AZN', symbol: '₼', decimals: 2 };

/** Müşteri ekranı erişimi: görme (`connections.view`) ve koşul yönetimi (`connections.terms.manage`). */
export interface CustomersAccess {
  readonly view: boolean;
  readonly manage: boolean;
  /** F2.15b: bağlantı iptali (US-025 AC1; satıcıda admin + satış müdürü, alıcıda admin). */
  readonly cancel: boolean;
}

export function customersAccess(codes: readonly string[]): CustomersAccess {
  const has = (code: string) => codes.includes(code);
  return {
    view: has('connections.view'),
    manage: has('connections.terms.manage'),
    cancel: has('connections.cancel'),
  };
}

// ---- İptal penceresi (F2.15b; web + mobil ortak) ----

/** İptal formu durumu: gerekçe seçilmeden ve ikinci onay kutusu işaretlenmeden gönderilmez. */
export interface CancelFormState {
  readonly reason: ConnectionCancelReason | null;
  readonly note: string;
  readonly confirmed: boolean;
}

export const EMPTY_CANCEL_FORM: CancelFormState = { reason: null, note: '', confirmed: false };

/**
 * Formu gövdeye çevirir; eksikse `undefined` (düğme kapalı). Not boşsa alan gönderilmez; uzun not
 * da `undefined` (sunucu 422 verirdi).
 */
export function cancelBody(form: CancelFormState): ConnectionCancelBody | undefined {
  if (form.reason === null || !form.confirmed) return undefined;
  const note = form.note.trim();
  if (note.length > CONNECTION_CANCEL_NOTE_MAX) return undefined;
  return { reason: form.reason, ...(note === '' ? {} : { note }), confirm: true };
}

/** İptal ucunun liste yenileyen hataları: bağlantı artık aktif değil veya görünmüyor. */
export const CONNECTION_CANCEL_ERROR_CODES = ['INVALID_STATE_TRANSITION', 'NOT_FOUND'] as const;

/** İptal hatası → mesaj anahtarı; bilinen kodda pencere onay düğmesini kaldırır, liste yenilenir. */
export function cancelFailure(body: unknown): RespondFailure {
  const object = typeof body === 'object' && body !== null ? body : {};
  const code = 'code' in object && typeof object.code === 'string' ? object.code : 'INTERNAL_ERROR';
  const known = (CONNECTION_CANCEL_ERROR_CODES as readonly string[]).includes(code);
  return {
    key: known ? `connections.cancel.error.${code}` : `errors.${code}`,
    refresh: known,
  };
}

/**
 * Kredi limiti kutusu (web + mobil): boş → `null` (limit yok); boşluk ve binlik ayırıcı boşluğu
 * atılır, ondalık virgül noktaya çevrilir; `CREDIT_LIMIT_PATTERN` dışı geçersiz.
 */
export function parseCreditLimit(
  raw: string,
): { readonly valid: true; readonly value: string | null } | { readonly valid: false } {
  // `\s` NBSP'yi (binlik ayırıcı) de kapsar.
  const value = raw.replace(/\s/g, '').replace(',', '.');
  if (value === '') return { valid: true, value: null };
  return CREDIT_LIMIT_PATTERN.test(value) ? { valid: true, value } : { valid: false };
}

/** Koşul penceresinin başlangıç değerleri; `source` hangi değerlerin önerildiğini söyler. */
export interface TermsFormValues {
  readonly creditLimit: string;
  readonly paymentTermDays: string;
  readonly salesRepMembershipId: string;
  readonly source: 'current' | 'previous_connection' | 'request' | 'none';
}

/**
 * US-024 AC3 + F2.14a K4: koşul atanmışsa mevcut koşullar; atanmamışsa öneri (önceki dönem veya
 * isteğin önerilen vadesi); yoksa boş limit, vade 0.
 */
export function termsFormValues(
  connection: Pick<ConnectionView, 'termsAssigned' | 'terms' | 'suggestedTerms'>,
): TermsFormValues {
  if (connection.termsAssigned) {
    return {
      creditLimit: connection.terms.creditLimit ?? '',
      paymentTermDays: String(connection.terms.paymentTermDays),
      salesRepMembershipId: connection.terms.salesRepMembershipId ?? '',
      source: 'current',
    };
  }
  const suggestion = connection.suggestedTerms ?? null;
  if (suggestion !== null) {
    return {
      creditLimit: suggestion.creditLimit ?? '',
      paymentTermDays: String(suggestion.paymentTermDays),
      salesRepMembershipId: suggestion.salesRepMembershipId ?? '',
      source: suggestion.source,
    };
  }
  return {
    creditLimit: '',
    paymentTermDays: String(connection.terms.paymentTermDays),
    salesRepMembershipId: connection.terms.salesRepMembershipId ?? '',
    source: 'none',
  };
}

/** Pencerenin gönderdiği gövde (`ConnectionTermsUpdate`'in alt kümesi; fiyat listesi F3.6). */
export interface TermsFormBody {
  readonly creditLimit: string | null;
  readonly paymentTermDays: number;
  /** Yoksa sunucu temsilciyi değiştirmez (PATCH kısmi). */
  readonly salesRepMembershipId?: string | null;
}

/**
 * Pencere gövdesi: limit ve vade her zaman gönderilir. Temsilci `undefined` ise (temsilci listesi
 * yüklenmedi/yüklenemedi) alan gönderilmez, böylece kayıtlı temsilci sessizce silinmez.
 */
export function termsUpdateBody(values: {
  readonly creditLimit: string;
  readonly paymentTermDays: string;
  readonly salesRepMembershipId: string | undefined;
}):
  | { readonly ok: true; readonly body: TermsFormBody }
  | { readonly ok: false; readonly creditLimit: boolean; readonly paymentTermDays: boolean } {
  const creditLimit = parseCreditLimit(values.creditLimit);
  const days = parseTermDays(values.paymentTermDays);
  const badLimit = !creditLimit.valid;
  const badDays = days === 'invalid' || days === undefined;
  if (!creditLimit.valid || badDays) {
    return { ok: false, creditLimit: badLimit, paymentTermDays: badDays };
  }
  const rep = values.salesRepMembershipId;
  return {
    ok: true,
    body:
      rep === undefined
        ? { creditLimit: creditLimit.value, paymentTermDays: days }
        : {
            creditLimit: creditLimit.value,
            paymentTermDays: days,
            salesRepMembershipId: rep === '' ? null : rep,
          },
  };
}

/** Koşul kaydı hatası → çeviri anahtarı (ekranın kendi metni; diğerleri genel `errors.*`). */
export function termsFailureKey(body: unknown): string {
  const code =
    typeof body === 'object' && body !== null && 'code' in body && typeof body.code === 'string'
      ? body.code
      : 'INTERNAL_ERROR';
  if (code === 'INVALID_STATE_TRANSITION') return 'customers.error.cancelled';
  if (code === 'NOT_FOUND') return 'customers.error.not_found';
  if (code === 'VALIDATION_FAILED') {
    const details =
      'details' in (body as object) ? (body as { details?: unknown }).details : undefined;
    if (typeof details === 'object' && details !== null && 'salesRepMembershipId' in details) {
      return 'customers.error.invalid_sales_rep';
    }
  }
  return `errors.${code}`;
}
