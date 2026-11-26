// PriceResolver saf çekirdeği (ADR-0019; US-034 AC2–AC4; test-strategy §3.1 P1–P11; R28).
// Sıra: şube fiyatı (bağlantıda açıksa) → müşteri fiyatı → bağlantıya atanmış liste → varsayılan
// liste; ilk bulunan kullanılır. Üzerine önce kademe indirimi, sonra şube indirimi; her adım birim
// fiyat hanesine (4) yarım yukarı yuvarlanır. Veritabanı yok, saat girdiden: aynı girdi aynı sonuç.
// F3.6a veri yükleyicisi yalnız iki listeyi doldurur; müşteri/şube fiyatı (F3.7/F3.8), kademe (F3.9)
// ve şube indirimi (F3.8) bu çekirdeğe girdi olarak bağlanır.
import type { PriceSource } from '@b2b/shared';
import { DomainError } from '../../core/errors/domain-error';
import {
  applyDiscountPercent,
  compare,
  fromDecimalString,
  LINE_TOTAL_SCALE,
  type Money,
  multiply,
  roundLineTotal,
  roundUnitPrice,
  toDecimalString,
  UNIT_PRICE_SCALE,
} from '../../core/money';

/** Bir fiyatın geçerlilik anından itibaren değeri (`valid_from ≤ now` olan en büyüğü geçerli). */
export interface PriceCandidate {
  readonly unitPrice: string;
  readonly validFrom: Date;
}

export interface PriceListSource {
  readonly listId: string;
  readonly name: string;
  readonly currency: string;
  readonly vatIncluded: boolean;
  readonly vatRate: string;
  /** Bu ambalaj seviyesinin bu listedeki fiyat satırları (sıra önemsiz). */
  readonly prices: readonly PriceCandidate[];
}

export interface TierRule {
  /** Satış birimi cinsinden eşik; miktar eşiğe eşitse indirim uygulanır (P7). */
  readonly minQty: string;
  readonly discountPercent: string;
}

export interface PriceResolverInput {
  readonly now: Date;
  /** Satıcının para birimi; seçilen liste farklıysa `CURRENCY_MISMATCH` (P10). */
  readonly currency: string;
  /** Satış birimi cinsinden miktar (kademe için); açıklamada 1. */
  readonly qty: string;
  readonly branchPricingEnabled: boolean;
  readonly branchPrices: readonly PriceCandidate[];
  readonly customerPrices: readonly PriceCandidate[];
  /** Bağlantıya atanmış aktif liste; atanmamışsa veya arşivliyse null. */
  readonly assignedList: PriceListSource | null;
  readonly defaultList: PriceListSource | null;
  readonly tiers: readonly TierRule[];
  readonly branchDiscountPercent: string | null;
}

export type ResolvedPrice =
  | { readonly source: 'none' }
  | {
      readonly source: Exclude<PriceSource, 'none'>;
      readonly currency: string;
      /** Kaynaktaki birim fiyat (indirimsiz), 4 hane. */
      readonly unitPrice: string;
      readonly tierDiscountPercent: string | null;
      readonly branchDiscountPercent: string | null;
      /** İndirimler sonrası birim fiyat, 4 hane; siparişe bu kopyalanır (F4). */
      readonly finalUnitPrice: string;
      /** Müşteri/şube fiyatında ƏDV bilgisi referans listeden (atanmış, yoksa varsayılan). */
      readonly vatIncluded: boolean | null;
      readonly vatRate: string | null;
      /** Liste kaynağında liste; müşteri/şube fiyatında null. */
      readonly priceList: { readonly id: string; readonly name: string } | null;
      readonly validFrom: Date;
    };

/** `valid_from ≤ now` olan en yeni fiyat; yoksa undefined (P6). */
export function effectivePrice(
  prices: readonly PriceCandidate[],
  now: Date,
): PriceCandidate | undefined {
  let best: PriceCandidate | undefined;
  for (const candidate of prices) {
    if (candidate.validFrom.getTime() > now.getTime()) continue;
    if (best === undefined || candidate.validFrom.getTime() > best.validFrom.getTime()) {
      best = candidate;
    }
  }
  return best;
}

interface Picked {
  readonly source: Exclude<PriceSource, 'none'>;
  readonly price: PriceCandidate;
  readonly list: PriceListSource | null;
}

function pick(input: PriceResolverInput): Picked | undefined {
  const branch = input.branchPricingEnabled
    ? effectivePrice(input.branchPrices, input.now)
    : undefined;
  if (branch !== undefined) return { source: 'branch_price', price: branch, list: null };
  const customer = effectivePrice(input.customerPrices, input.now);
  if (customer !== undefined) return { source: 'customer_price', price: customer, list: null };
  if (input.assignedList !== null) {
    const assigned = effectivePrice(input.assignedList.prices, input.now);
    if (assigned !== undefined) {
      return { source: 'price_list', price: assigned, list: input.assignedList };
    }
  }
  if (input.defaultList !== null) {
    const fallback = effectivePrice(input.defaultList.prices, input.now);
    if (fallback !== undefined) {
      return { source: 'default_list', price: fallback, list: input.defaultList };
    }
  }
  return undefined;
}

/** Miktarın ulaştığı en büyük kademe (eşik dahil, P7). */
function tierFor(tiers: readonly TierRule[], qty: Money): TierRule | undefined {
  let best: TierRule | undefined;
  for (const tier of tiers) {
    const min = fromDecimalString(tier.minQty);
    if (compare(qty, min) < 0) continue;
    if (best === undefined || compare(min, fromDecimalString(best.minQty)) > 0) best = tier;
  }
  return best;
}

function percentText(value: Money): string {
  return toDecimalString(value, LINE_TOTAL_SCALE);
}

export function resolvePrice(input: PriceResolverInput): ResolvedPrice {
  const picked = pick(input);
  if (picked === undefined) return { source: 'none' };

  // Müşteri/şube fiyatının para birimi satıcınınkidir (satırda para birimi yok, data-model §4.9).
  if (picked.list !== null && picked.list.currency !== input.currency) {
    throw new DomainError('CURRENCY_MISMATCH', {
      expected: input.currency,
      actual: picked.list.currency,
    });
  }
  const vatSource = picked.list ?? input.assignedList ?? input.defaultList;

  const unitPrice = fromDecimalString(picked.price.unitPrice);
  let finalPrice = roundUnitPrice(unitPrice);
  let tierDiscountPercent: string | null = null;
  const tier = tierFor(input.tiers, fromDecimalString(input.qty));
  if (tier !== undefined) {
    const percent = fromDecimalString(tier.discountPercent);
    finalPrice = applyDiscountPercent(finalPrice, percent);
    tierDiscountPercent = percentText(percent);
  }
  let branchDiscountPercent: string | null = null;
  if (input.branchDiscountPercent !== null) {
    const percent = fromDecimalString(input.branchDiscountPercent);
    finalPrice = applyDiscountPercent(finalPrice, percent);
    branchDiscountPercent = percentText(percent);
  }

  return {
    source: picked.source,
    currency: input.currency,
    unitPrice: toDecimalString(unitPrice, UNIT_PRICE_SCALE),
    tierDiscountPercent,
    branchDiscountPercent,
    finalUnitPrice: toDecimalString(finalPrice, UNIT_PRICE_SCALE),
    vatIncluded: vatSource?.vatIncluded ?? null,
    vatRate: vatSource === null ? null : percentText(fromDecimalString(vatSource.vatRate)),
    priceList: picked.list === null ? null : { id: picked.list.listId, name: picked.list.name },
    validFrom: picked.price.validFrom,
  };
}

/** Satır toplamı: birim × miktar, 2 hane yarım yukarı (P11). */
export function lineTotal(finalUnitPrice: string, qty: string): string {
  return toDecimalString(
    roundLineTotal(multiply(fromDecimalString(finalUnitPrice), fromDecimalString(qty))),
    LINE_TOTAL_SCALE,
  );
}
