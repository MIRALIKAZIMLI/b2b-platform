// Ekip formu kapsam seçenekleri (F3.11e): saf yardımcılar (ekran dışı, birim testli).
import type { ScopeNeeds } from '@b2b/shared';
import type { Option } from '../admin-sellers/api';

export interface ScopeOptions {
  /** Üye satırındaki adlar; `undefined`: liste okunamadı. */
  readonly warehouses: readonly Option[] | undefined;
  readonly branches: readonly Option[] | undefined;
  /** Seçilebilir şube / depolar (sunucu süzer); `undefined`: okunamadı. */
  readonly branchChoices: readonly Option[] | undefined;
  readonly warehouseChoices: readonly Option[] | undefined;
  /** Seçim aktörün kendi şubesiyle / deposuyla sınırlı mı (açıklama gösterilir). */
  readonly branchOwnOnly: boolean;
  readonly warehouseOwnOnly: boolean;
  readonly regions: readonly Option[];
}

/** Gereken kapsam seçilebiliyor mu (liste yoksa form gönderilemez). */
export function scopeAvailable(needs: ScopeNeeds, options: ScopeOptions): boolean {
  return (
    (!needs.branch || (options.branchChoices !== undefined && options.branchChoices.length > 0)) &&
    (!needs.warehouse ||
      (options.warehouseChoices !== undefined && options.warehouseChoices.length > 0))
  );
}

/** Üye satırındaki adlar için iki listenin birleşimi (tam liste + seçenekler); sıra korunur. */
export function mergeOptions(
  full: readonly Option[] | undefined,
  choices: readonly Option[] | undefined,
): readonly Option[] | undefined {
  if (full === undefined) return choices;
  if (choices === undefined) return full;
  const seen = new Set(full.map((item) => item.id));
  return [...full, ...choices.filter((item) => !seen.has(item.id))];
}
