import { Injectable } from '@nestjs/common';
import type { LimitEntitlementKey } from '@b2b/shared';
import type { Tx } from '../../core/db';

/** Mevcut kullanım: hakkı ölçen modül, verilen kiracı işleminde sayar (ör. aktif kullanıcı sayısı). */
export type EntitlementUsageCounter = (ctx: {
  readonly businessId: string;
  readonly tx: Tx;
}) => Promise<number>;

/**
 * Sayısal hakların kullanım sayaçları. Her sayaç, hakkı ölçen modül tarafından kendi adımında
 * kaydedilir (ör. `users.max` → F2.7). F1.4b'de yalnızca testler sayaç kaydeder.
 */
@Injectable()
export class EntitlementUsageRegistry {
  private readonly counters = new Map<LimitEntitlementKey, EntitlementUsageCounter>();

  register(key: LimitEntitlementKey, counter: EntitlementUsageCounter): void {
    if (this.counters.has(key)) {
      throw new Error(`Hak sayacı iki kez kaydedildi: ${key}`);
    }
    this.counters.set(key, counter);
  }

  /** Kayıtlı sayaç; yoksa programcı hatası (hakkı ölçen modül sayacını kaydetmemiş). */
  counterFor(key: LimitEntitlementKey): EntitlementUsageCounter {
    const counter = this.counters.get(key);
    if (counter === undefined) {
      throw new Error(`Hak sayacı kayıtlı değil: ${key}`);
    }
    return counter;
  }
}
