// Admin ayar ekranı (F2.19, US-017). Okuma tek `withPlatformTx` içinde kapsamın varlığını denetler
// ve `SettingsService.listForScopeTx` ile satırları döner. Yazma `SettingsService.set` üzerinden:
// tip/sınır/çapraz kural (US-017 AC3) ve audit (AC2) orada. Kapsam kısıtı (F2.19 T2) burada:
// `SettingsService.set` genel servistir; yalnız admin ucu anahtarın `scopes` listesine bakar.
import { Inject, Injectable } from '@nestjs/common';
import {
  type AdminSettingsQuery,
  type AdminSettingUpdate,
  type SettingKey,
  settingScopesOf,
} from '@b2b/shared';
import type { AuditRequestContext } from '../../core/audit';
import { type Tx, withPlatformTx } from '../../core/db';
import { DomainError } from '../../core/errors/domain-error';
import { PlanService } from '../billing';
import { BusinessesRepository } from '../businesses';
import { type AdminSettingView, SettingsService, type SettingTarget } from '../settings';
import type { PlatformActor } from './sellers.service';

export interface AdminSettingsList {
  readonly scope: SettingTarget['scope'];
  readonly scopeId: string | null;
  readonly items: AdminSettingView[];
}

@Injectable()
export class SettingsAdminService {
  constructor(
    @Inject(SettingsService) private readonly settings: SettingsService,
    @Inject(PlanService) private readonly plans: PlanService,
    @Inject(BusinessesRepository) private readonly businesses: BusinessesRepository,
  ) {}

  async list(actor: PlatformActor, query: AdminSettingsQuery): Promise<AdminSettingsList> {
    const target = toTarget(query.scope, query.scopeId ?? null);
    const items = await withPlatformTx(actor, async (tx) => {
      await this.assertTargetExists(tx, target);
      return await this.settings.listForScopeTx(tx, target);
    });
    return { scope: target.scope, scopeId: query.scopeId ?? null, items };
  }

  /** US-017 AC1–AC3. Yanıt: güncellenen anahtarın bu kapsamdaki güncel satırı. */
  async update(
    actor: PlatformActor,
    input: AdminSettingUpdate,
    context: AuditRequestContext,
  ): Promise<AdminSettingView> {
    const target = toTarget(input.scope, input.scopeId ?? null);
    if (!settingScopesOf(input.key).includes(target.scope)) {
      throw new DomainError('SETTING_SCOPE_NOT_ALLOWED', { key: input.key, scope: target.scope });
    }
    await withPlatformTx(actor, (tx) => this.assertTargetExists(tx, target));
    await this.settings.set(input.key, input.value, target, { userId: actor.userId, context });
    return await this.row(actor, target, input.key);
  }

  private async row(
    actor: PlatformActor,
    target: SettingTarget,
    key: SettingKey,
  ): Promise<AdminSettingView> {
    const items = await withPlatformTx(actor, (tx) => this.settings.listForScopeTx(tx, target));
    const item = items.find((candidate) => candidate.key === key);
    if (item === undefined) throw new DomainError('NOT_FOUND');
    return item;
  }

  /** Olmayan plan veya işletme → 404 (settings.scope_id FK taşımaz; F2.19 T5). */
  private async assertTargetExists(tx: Tx, target: SettingTarget): Promise<void> {
    if (target.scope === 'plan' && (await this.plans.findPlanTx(tx, target.planId)) === undefined) {
      throw new DomainError('NOT_FOUND');
    }
    if (
      target.scope === 'business' &&
      (await this.businesses.lockOwnTx(tx, target.businessId, false)) === undefined
    ) {
      throw new DomainError('NOT_FOUND');
    }
  }
}

function toTarget(scope: SettingTarget['scope'], scopeId: string | null): SettingTarget {
  if (scope === 'platform') return { scope };
  if (scopeId === null) throw new DomainError('VALIDATION_FAILED');
  return scope === 'plan' ? { scope, planId: scopeId } : { scope, businessId: scopeId };
}
