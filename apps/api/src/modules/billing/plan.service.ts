import { Inject, Injectable } from '@nestjs/common';
import type { LocalizedText } from '@b2b/shared';
import { IdGenerator } from '../../core/id-generator';
import { fromDecimalString, LINE_TOTAL_SCALE, type Money, toDecimalString } from '../../core/money';
import { BillingRepository } from './billing.repository';
import type { PlanPeriod } from './billing.schema';

export type PlanCapability = 'seller' | 'buyer';

export interface Plan {
  readonly id: string;
  readonly code: string;
  readonly name: LocalizedText;
  readonly capability: PlanCapability;
  readonly price: Money;
  readonly currencyCode: string;
  readonly period: PlanPeriod;
  readonly isActive: boolean;
}

export interface NewPlan {
  readonly code: string;
  readonly name: LocalizedText;
  readonly capability: PlanCapability;
  readonly price: Money;
  readonly currencyCode: string;
  readonly period: PlanPeriod;
}

export interface NewSubscription {
  readonly businessId: string;
  readonly planId: string;
  /** `YYYY-MM-DD` */
  readonly currentPeriodStart: string;
  /** `YYYY-MM-DD` */
  readonly currentPeriodEnd: string;
  readonly paymentNote?: string;
}

export interface PlanActor {
  readonly userId: string;
}

/**
 * Plan ve abonelik kayıtları (F1.4b). Kimlikler UUIDv7 (Mimar D4); fiyat `Money`, asla `number`.
 * Plan yönetim ekranı ve abonelik durum geçişleri F6.3'te; burada yalnızca oluşturma ve okuma.
 */
@Injectable()
export class PlanService {
  constructor(
    @Inject(BillingRepository) private readonly repository: BillingRepository,
    @Inject(IdGenerator) private readonly ids: IdGenerator,
  ) {}

  async createPlan(plan: NewPlan, actor: PlanActor): Promise<string> {
    const id = this.ids.next();
    await this.repository.insertPlan(actor, {
      id,
      code: plan.code,
      name: plan.name,
      capability: plan.capability,
      price: toDecimalString(plan.price, LINE_TOTAL_SCALE),
      currencyCode: plan.currencyCode,
      period: plan.period,
    });
    return id;
  }

  async findPlan(planId: string): Promise<Plan | undefined> {
    const row = await this.repository.findPlan(planId);
    if (row === undefined) return undefined;
    return {
      id: row.id,
      code: row.code,
      name: row.name as LocalizedText,
      capability: row.capability as PlanCapability,
      price: fromDecimalString(row.price),
      currencyCode: row.currencyCode,
      period: row.period as PlanPeriod,
      isActive: row.isActive,
    };
  }

  /** Güncel abonelik açar (`active`; state-machines §8 başlangıç durumu). */
  async startSubscription(subscription: NewSubscription, actor: PlanActor): Promise<string> {
    const id = this.ids.next();
    await this.repository.insertSubscription(actor, {
      id,
      businessId: subscription.businessId,
      planId: subscription.planId,
      status: 'active',
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      paymentNote: subscription.paymentNote ?? null,
    });
    return id;
  }
}
