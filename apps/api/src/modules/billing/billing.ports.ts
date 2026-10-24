import type { EntitlementKey } from '@b2b/shared';
import type { PlatformTxContext, Tx } from '../../core/db';

/**
 * Bir hak anahtarının işletme için ham değerleri (doğrulanmamış jsonb). Alan yoksa o kaynakta
 * satır yoktur. `plan`: güncel aboneliğin planındaki değer. Sıra: istisna → plan (ADR-0009).
 */
export interface EntitlementSources {
  readonly override?: unknown;
  readonly plan?: unknown;
}

export interface EntitlementRepositoryPort {
  /** `tx` verilirse onu kullanır (çağıranın kiracı işlemi); yoksa kullanıcısız kiracı işlemi açar. */
  inTenantTx<T>(businessId: string, tx: Tx | undefined, fn: (tx: Tx) => Promise<T>): Promise<T>;
  findSources(tx: Tx, businessId: string, key: EntitlementKey): Promise<EntitlementSources>;
  writePlanEntitlement(
    ctx: PlatformTxContext,
    planId: string,
    key: EntitlementKey,
    value: unknown,
  ): Promise<void>;
  writeOverride(
    ctx: PlatformTxContext,
    businessId: string,
    key: EntitlementKey,
    value: unknown,
    reason: string | null,
  ): Promise<void>;
}
