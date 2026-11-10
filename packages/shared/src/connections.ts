// Bağlantı isteği sözleşmesi (F2.12a; openapi `POST /api/v1/connection-requests`,
// `GET /api/v1/connection-requests/outgoing`, şema `ConnectionRequest`). İstemci ve sunucu ortak.
import { z } from 'zod';

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
}

/** Gelen bekleyen istek: mesaj ve önerilen vade `ConnectionRequestView`'da. */
export interface IncomingConnectionRequest extends ConnectionRequestView {
  readonly seller: ConnectionSellerSummary;
}

export interface IncomingConnectionRequestPage {
  readonly items: readonly IncomingConnectionRequest[];
  readonly nextCursor: string | null;
}

/** openapi `ConnectionTerms`; `creditLimit` ondalık metin (para, `numeric`). */
export interface ConnectionTermsView {
  readonly priceListId: string | null;
  readonly branchPricingEnabled: boolean;
  readonly creditLimit: string | null;
  readonly paymentTermDays: number;
  readonly salesRepMembershipId: string | null;
}

/** openapi `Connection`. */
export interface ConnectionView {
  readonly id: string;
  readonly sellerId: string;
  readonly buyerId: string;
  readonly counterpartyName: string;
  readonly status: 'active' | 'cancelled';
  readonly terms: ConnectionTermsView;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly endedBySide: 'seller' | 'buyer' | null;
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
] as const;

/** Bu kodlar kartın ilişki durumunun eskidiğini gösterir: dizin yeniden yüklenir. */
const RELATION_CHANGED: ReadonlySet<string> = new Set([
  'CONNECTION_REQUEST_ALREADY_PENDING',
  'CONNECTION_ALREADY_ACTIVE',
  'CONNECTION_BLOCKED',
  'CONNECTION_COOLDOWN_ACTIVE',
  'NOT_FOUND',
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
