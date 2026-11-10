// Perakendeci dizini araması (F2.11b, openapi `GET /api/v1/directory/buyers`, US-019, US-020).
// Sorgu şeması API'de doğrulanır; web ve mobil aynı türleri kullanır.
import { z } from 'zod';
import { PHONE_E164_PATTERN } from './business-profile';
import type { LocalizedText } from './localized-text';
import { VOEN_PATTERN } from './voen';

/** Sayfa başına en fazla kayıt (US-019 AC1). */
export const DIRECTORY_PAGE_MAX = 20;
/** `regionId` filtresinde en fazla bölge. */
export const DIRECTORY_REGION_FILTER_MAX = 50;

/** openapi `history` (bağlantı geçmişi). Bağlantı tabloları F2.12–F2.15'te gelir. */
export const DIRECTORY_HISTORY_VALUES = [
  'never',
  'rejected',
  'cancelled',
  'cooldown_over',
  'pending',
  'active',
] as const;
export type DirectoryHistory = (typeof DIRECTORY_HISTORY_VALUES)[number];

/** Boş sonucun nedeni (Mimar K5): istemci kullanıcıyı doğru ekrana yönlendirir. */
export const DIRECTORY_EMPTY_REASONS = ['no_service_areas', 'no_assigned_regions'] as const;
export type DirectoryEmptyReason = (typeof DIRECTORY_EMPTY_REASONS)[number];

const uuid = z.uuid();
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? undefined : value))
    .optional();

/** Sorgu dizesindeki tekil veya tekrarlı değer (`regionId=a&regionId=b`) → dizi. */
const regionIds = z.preprocess(
  (value) => (value === undefined ? undefined : Array.isArray(value) ? value : [value]),
  z.array(uuid).min(1).max(DIRECTORY_REGION_FILTER_MAX).optional(),
);

const booleanParam = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .optional();

/**
 * Sorgu parametreleri. Tam telefon veya tam VÖEN araması tek başına yapılır (US-020): ikisi
 * birlikte ya da filtrelerle verilirse doğrulama hatası.
 */
export const directorySearchQuerySchema = z
  .object({
    q: optionalText(100),
    phone: z.string().regex(PHONE_E164_PATTERN).optional(),
    voen: z.string().regex(VOEN_PATTERN).optional(),
    regionId: regionIds,
    activityTypeId: uuid.optional(),
    verified: booleanParam,
    history: z.enum(DIRECTORY_HISTORY_VALUES).optional(),
    cursor: z
      .string()
      .regex(/^[0-9]{1,4}$/)
      .optional(),
    limit: z.coerce.number().int().min(1).max(DIRECTORY_PAGE_MAX).default(DIRECTORY_PAGE_MAX),
  })
  .superRefine((query, ctx) => {
    const exact = query.phone !== undefined || query.voen !== undefined;
    if (query.phone !== undefined && query.voen !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['voen'], message: 'phone_or_voen' });
    }
    const filtered =
      query.q !== undefined ||
      query.regionId !== undefined ||
      query.activityTypeId !== undefined ||
      query.verified !== undefined ||
      query.history !== undefined ||
      query.cursor !== undefined;
    if (exact && filtered) {
      ctx.addIssue({ code: 'custom', path: ['phone'], message: 'exact_match_alone' });
    }
  });

export type DirectorySearchQuery = z.infer<typeof directorySearchQuerySchema>;

/** openapi `DirectoryBuyer.relation` (F2.12a'dan beri satıcının bağlantı verisinden). */
export interface DirectoryRelation {
  readonly status: 'none' | 'pending' | 'active' | 'rejected' | 'cancelled' | 'blocked';
  readonly cooldownUntil: string | null;
  readonly canRequest: boolean;
}

/**
 * openapi `DirectoryBuyer`: yalnız perakendecinin açtığı alanlar dolu (US-007 AC1–AC2).
 * Başka bağlantı ve alım bilgisi yoktur (US-007 AC6); anahtar listesi sabittir.
 */
export interface DirectoryBuyer {
  readonly id: string;
  readonly legalName: string;
  readonly activityTypeId: string;
  readonly activityType: LocalizedText;
  readonly regionId: string;
  readonly cityId: string;
  readonly region: LocalizedText;
  readonly verified: boolean;
  readonly logoUrl: string | null;
  readonly addressLine: string | null;
  readonly businessPhone: string | null;
  readonly voen: string | null;
  readonly contactName: string | null;
  readonly personalPhone: string | null;
  readonly email: string | null;
  readonly relation: DirectoryRelation;
}

/** Yanıttaki `DirectoryBuyer` anahtarları (şema testi, TM-10). */
export const DIRECTORY_BUYER_KEYS = [
  'id',
  'legalName',
  'activityTypeId',
  'activityType',
  'regionId',
  'cityId',
  'region',
  'verified',
  'logoUrl',
  'addressLine',
  'businessPhone',
  'voen',
  'contactName',
  'personalPhone',
  'email',
  'relation',
] as const satisfies readonly (keyof DirectoryBuyer)[];

export interface DirectorySearchResult {
  readonly items: readonly DirectoryBuyer[];
  readonly nextCursor: string | null;
  readonly emptyReason: DirectoryEmptyReason | null;
}

/** Tam eşleşme kutusuna yazılan değer (US-020): `+` ile başlayan telefon veya 10 haneli VÖEN. */
export type ExactLookup = { readonly phone: string } | { readonly voen: string };

/**
 * Boşluk, tire ve parantez atılır. `+` ile başlayan tam E.164 → telefon; 10 rakam ve geçerli
 * VÖEN → VÖEN; diğerleri `undefined` (istemci "tam numara veya VÖEN yazın" der, istek gitmez).
 */
export function parseExactLookup(input: string): ExactLookup | undefined {
  const compact = input.replace(/[\s()-]/g, '');
  if (PHONE_E164_PATTERN.test(compact)) return { phone: compact };
  if (VOEN_PATTERN.test(compact)) return { voen: compact };
  return undefined;
}
