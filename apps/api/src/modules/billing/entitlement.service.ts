import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type EntitlementKey,
  type EntitlementValue,
  type FeatureEntitlementKey,
  isEntitlementKey,
  type LimitEntitlementKey,
  parseEntitlementValue,
} from '@b2b/shared';
import type { Tx } from '../../core/db';
import { DomainError } from '../../core/errors/domain-error';
import { BillingRepository } from './billing.repository';
import type { EntitlementRepositoryPort, EntitlementSources } from './billing.ports';
import { EntitlementUsageRegistry } from './entitlement-usage.registry';

export interface EntitlementActor {
  /** Değeri yazan platform kullanıcısı. */
  readonly userId: string;
}

/**
 * Plan hakları (ADR-0009, US-055). Değer sırası: işletmeye özel istisna → güncel aboneliğin
 * planı. Kod plan adına bakmaz; yalnızca hak anahtarı sorar. Güncel aboneliği olmayan işletmede
 * veya değer yoksa sayısal hak reddedilir, özellik kapalı sayılır (F1.4b kararı). `null` = sınırsız.
 */
@Injectable()
export class EntitlementService {
  private readonly logger = new Logger(EntitlementService.name);

  constructor(
    @Inject(BillingRepository) private readonly repository: EntitlementRepositoryPort,
    @Inject(EntitlementUsageRegistry) private readonly usage: EntitlementUsageRegistry,
  ) {}

  /**
   * `delta` kadar artış hakkı aşacaksa `ENTITLEMENT_LIMIT_REACHED` fırlatır. `tx` verilirse
   * değer ve kullanım çağıranın işleminde okunur (kaydı ekleyen işlemle aynı olması önerilir).
   */
  async check(
    key: LimitEntitlementKey,
    businessId: string,
    delta = 1,
    tx?: Tx,
  ): Promise<void> {
    if (!Number.isInteger(delta) || delta < 1) {
      throw new TypeError('delta pozitif tamsayı olmalı');
    }
    const counter = this.usage.counterFor(key);
    await this.repository.inTenantTx(businessId, tx, async (inner) => {
      const limit = await this.valueOf(inner, businessId, key);
      if (limit === undefined) {
        throw new DomainError('ENTITLEMENT_LIMIT_REACHED', { key });
      }
      if (limit === null) return;
      const current = await counter({ businessId, tx: inner });
      if (current + delta > limit) {
        throw new DomainError('ENTITLEMENT_LIMIT_REACHED', { key, limit });
      }
    });
  }

  /** Özellik hakkı açık mı? Değer yoksa kapalı. */
  async isEnabled(key: FeatureEntitlementKey, businessId: string, tx?: Tx): Promise<boolean> {
    const value = await this.repository.inTenantTx(businessId, tx, (inner) =>
      this.valueOf(inner, businessId, key),
    );
    return value === true;
  }

  /** Planın hak değerini yazar (platform bağlamı). Bilinmeyen anahtar / yanlış tip → `VALIDATION_FAILED`. */
  async setPlanEntitlement(
    planId: string,
    key: EntitlementKey,
    value: unknown,
    actor: EntitlementActor,
  ): Promise<void> {
    const parsed = this.validate(key, value);
    await this.repository.writePlanEntitlement(actor, planId, key, parsed);
  }

  /** İşletmeye özel istisna yazar (platform bağlamı); plan değerinin yerine geçer (US-055 AC3). */
  async setOverride(
    businessId: string,
    key: EntitlementKey,
    value: unknown,
    reason: string | null,
    actor: EntitlementActor,
  ): Promise<void> {
    const parsed = this.validate(key, value);
    await this.repository.writeOverride(actor, businessId, key, parsed, reason);
  }

  private validate(key: EntitlementKey, value: unknown): unknown {
    if (!isEntitlementKey(key)) {
      throw new DomainError('VALIDATION_FAILED', { key: String(key) });
    }
    const parsed = parseEntitlementValue(key, value);
    if (!parsed.ok) {
      throw new DomainError('VALIDATION_FAILED', { key });
    }
    return parsed.value;
  }

  /** İstisna → plan; geçersiz kayıtlı değer uyarıyla atlanır. Değer yoksa undefined. */
  private async valueOf<K extends EntitlementKey>(
    tx: Tx,
    businessId: string,
    key: K,
  ): Promise<EntitlementValue<K> | undefined> {
    const sources: EntitlementSources = await this.repository.findSources(tx, businessId, key);
    const candidates: [source: string, present: boolean, raw: unknown][] = [
      ['override', 'override' in sources, sources.override],
      ['plan', 'plan' in sources, sources.plan],
    ];
    for (const [source, present, raw] of candidates) {
      if (!present) continue;
      const parsed = parseEntitlementValue(key, raw);
      if (parsed.ok) return parsed.value;
      this.logger.warn(
        `entitlements.invalid_value: kayıtlı hak değeri geçersiz, atlanıyor (anahtar: ${key}, kaynak: ${source})`,
      );
    }
    return undefined;
  }
}
