// Fiyat listeleri ve fiyat açıklaması (F3.6a; US-034, ADR-0019; openapi `pricing` etiketi).
// Para metinleri openapi `Decimal`; hesap API'de `decimal.js` ile (core/money.ts). İstemcinin
// gönderdiği fiyat yalnız fiyat listesine yazılır; sipariş fiyatı her zaman `PriceResolver`'dan.
import { z } from 'zod';

export const PRICE_LIST_STATUSES = ['active', 'archived'] as const;
export type PriceListStatus = (typeof PRICE_LIST_STATUSES)[number];

/** ADR-0019 sırası; `none` = hiçbir kaynakta fiyat yok (US-034 AC4). */
export const PRICE_SOURCES = [
  'branch_price',
  'customer_price',
  'price_list',
  'default_list',
  'none',
] as const;
export type PriceSource = (typeof PRICE_SOURCES)[number];

export const PRICE_LIST_NAME_MAX = 120;
/** `PUT /price-lists/{id}/items` tek istekte en çok bu kadar satır (openapi `maxItems`). */
export const PRICE_LIST_ITEMS_MAX = 1000;

/** Birim fiyat `numeric(14,4)`: negatif değil, en çok 10 tam + 4 ondalık hane. */
export const UNIT_PRICE_PATTERN = /^\d{1,10}(\.\d{1,4})?$/;
/** ƏDV oranı `numeric(5,2)`: 0–100, en çok 2 ondalık. */
export const VAT_RATE_PATTERN = /^\d{1,3}(\.\d{1,2})?$/;

const vatRateSchema = z
  .string()
  .regex(VAT_RATE_PATTERN)
  .refine((value) => Number.parseFloat(value) <= 100, { message: 'vat_rate_max' });

const nameSchema = z.string().trim().min(1).max(PRICE_LIST_NAME_MAX);

/** `POST /price-lists` (US-034 AC1). Satıcının ilk listesi `isDefault` verilmese de varsayılandır. */
export const priceListCreateSchema = z
  .object({
    name: nameSchema,
    currency: z.string().regex(/^[A-Z]{3}$/),
    vatIncluded: z.boolean(),
    vatRate: vatRateSchema,
    isDefault: z.boolean().optional(),
  })
  .strict();
export type PriceListCreate = z.infer<typeof priceListCreateSchema>;

/**
 * `PATCH /price-lists/{id}` (kısmi, en az bir alan). Varsayılanlık yalnız devredilir
 * (`isDefault: true`, K3); para birimi değişmez (K6).
 */
export const priceListUpdateSchema = z
  .object({
    name: nameSchema.optional(),
    vatIncluded: z.boolean().optional(),
    vatRate: vatRateSchema.optional(),
    isDefault: z.literal(true).optional(),
    status: z.enum(PRICE_LIST_STATUSES).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'empty_update' });
export type PriceListUpdate = z.infer<typeof priceListUpdateSchema>;

/**
 * `PUT /price-lists/{id}/items`. `validFrom` takvim günüdür (`YYYY-MM-DD`): fiyat o gün
 * toptancının saat diliminde 00:00'da geçerli olur (US-034 AC6, K4). Verilmezse hemen geçerli.
 */
export const priceListItemsSetSchema = z
  .object({
    validFrom: z.iso.date().optional(),
    items: z
      .array(
        z
          .object({
            packagingId: z.uuid(),
            unitPrice: z.string().regex(UNIT_PRICE_PATTERN),
          })
          .strict(),
      )
      .min(1)
      .max(PRICE_LIST_ITEMS_MAX)
      .refine((items) => new Set(items.map((item) => item.packagingId)).size === items.length, {
        message: 'duplicate_packaging',
      }),
  })
  .strict();
export type PriceListItemsSet = z.infer<typeof priceListItemsSetSchema>;

/** `GET /price-lists/{id}/items` süzgecinde en çok bu kadar ambalaj kimliği (F3.6b K1). */
export const PRICE_LIST_ITEMS_FILTER_MAX = 100;

export const priceListItemsQuerySchema = z
  .object({
    cursor: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    // F3.6b K1: yalnız bu ambalaj seviyelerinin fiyatları (ürün formu). Tekrarlı sorgu parametresi;
    // tek değer metin olarak gelir. Başka satıcının ambalajı RLS ve liste koşuluyla boş döner.
    packagingId: z
      .preprocess(
        (value) => (typeof value === 'string' ? [value] : value),
        z.array(z.uuid()).min(1).max(PRICE_LIST_ITEMS_FILTER_MAX),
      )
      .optional(),
  })
  .strict();
export type PriceListItemsQuery = z.infer<typeof priceListItemsQuerySchema>;

/** `GET /prices/explain` (US-034 AC5). `branchId` F3.8'e kadar yok sayılır. */
export const priceExplainQuerySchema = z
  .object({
    buyerId: z.uuid(),
    branchId: z.uuid().optional(),
    packagingId: z.uuid(),
  })
  .strict();
export type PriceExplainQuery = z.infer<typeof priceExplainQuerySchema>;

export interface MoneyView {
  readonly amount: string;
  readonly currency: string;
}

export interface PriceListView {
  readonly id: string;
  readonly name: string;
  readonly currency: string;
  readonly vatIncluded: boolean;
  readonly vatRate: string;
  readonly isDefault: boolean;
  readonly status: PriceListStatus;
  /** Fiyatı girilmiş ambalaj seviyesi sayısı (geçerli veya ileri tarihli). */
  readonly itemCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PriceListPage {
  readonly items: readonly PriceListView[];
}

export interface PricePoint {
  readonly unitPrice: string;
  readonly validFrom: string;
}

export interface PriceListItemView {
  readonly packagingId: string;
  /** Şu an geçerli fiyat; yalnız ileri tarihli fiyatı olan seviyede `null`. */
  readonly current: PricePoint | null;
  /** Henüz geçerli olmayan fiyatlar, tarihe göre artan. */
  readonly scheduled: readonly PricePoint[];
}

export interface PriceListItemPage {
  readonly items: readonly PriceListItemView[];
  readonly nextCursor: string | null;
}

/** openapi `ResolvedPrice`; `source: none` iken fiyat alanları `null`. */
export interface ResolvedPriceView {
  readonly unitPrice: MoneyView | null;
  readonly source: PriceSource;
  readonly tierDiscountPercent: string | null;
  readonly branchDiscountPercent: string | null;
  readonly finalUnitPrice: MoneyView | null;
  readonly vatIncluded: boolean | null;
  readonly vatRate: string | null;
}

/** openapi `PriceExplanation`: yalnız satıcı bakışı (alıcıya liste adı gitmez). */
export interface PriceExplanationView extends ResolvedPriceView {
  readonly priceList: { readonly id: string; readonly name: string } | null;
  readonly validFrom: string | null;
}
