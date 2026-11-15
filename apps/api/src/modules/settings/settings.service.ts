import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  checkDormantOrder,
  DORMANT_SETTING_KEYS,
  isSettingKey,
  parseSettingValue,
  SETTING_KEYS,
  type SettingKey,
  type SettingMeta,
  type SettingScope,
  type SettingSource,
  type SettingValue,
  settingDefault,
  settingMetaOf,
  settingScopesOf,
} from '@b2b/shared';
import {
  type AuditRecorder,
  type AuditRequestContext,
  AuditService,
  settingAuditTargetId,
} from '../../core/audit';
import type { Tx } from '../../core/db';
import { DomainError } from '../../core/errors/domain-error';
import { SettingsCache } from './settings.cache';
import type {
  SettingLayers,
  SettingScopeRow,
  SettingsCachePort,
  SettingsRepositoryPort,
  SettingTarget,
} from './settings.ports';
import { SettingsRepository } from './settings.repository';

export type { SettingTarget } from './settings.ports';

/** Önbellek ömrünün kendisi de bir ayardır (US-017). */
const CACHE_TTL_KEY = 'settings.cache_ttl_seconds';

const DORMANT_KEYS: ReadonlySet<SettingKey> = new Set(DORMANT_SETTING_KEYS);

export interface SettingActor {
  /** Ayarı değiştiren platform kullanıcısı (`updated_by`). */
  readonly userId: string;
  /** Audit için istek bilgisi; HTTP ucu (controller) verir. */
  readonly context?: AuditRequestContext;
}

/** Admin ayar ekranının bir satırı (openapi `AdminSettingItem`, F2.19). */
export interface AdminSettingView extends SettingMeta {
  readonly key: SettingKey;
  readonly scopes: readonly SettingScope[];
  /** Bu kapsamdaki geçerli kayıt; yoksa (veya kayıt geçersizse) null. */
  readonly value: unknown;
  /** Bu kapsamda kayıt yokken geçerli olan değer ve kaynağı. */
  readonly inheritedValue: unknown;
  readonly inheritedFrom: SettingSource;
  readonly updatedAt: Date | null;
}

/**
 * Katmanlı ayarlar (ADR-0009). Çözümleme: işletme → plan → platform → kod varsayılanı. Plan
 * katmanı işletmenin güncel aboneliğinin planıdır (F1.4b); işletmesiz çağrıda plan katmanı yoktur.
 * Değer tipi ve sınırı `@b2b/shared` ayar kaydından gelir.
 */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    @Inject(SettingsRepository) private readonly repository: SettingsRepositoryPort,
    @Inject(SettingsCache) private readonly cache: SettingsCachePort,
    @Inject(AuditService) private readonly audit: AuditRecorder,
  ) {}

  async get<K extends SettingKey>(key: K, businessId?: string): Promise<SettingValue<K>> {
    const layers = await this.loadLayers(key, businessId);
    return this.resolve(key, layers);
  }

  /**
   * Değeri doğrular ve yazar (yalnızca platform bağlamı; işletme kendi ayarını yazamaz).
   * Tip, sınır veya çapraz kural ihlali → `SETTING_OUT_OF_RANGE`. Eski ve yeni değer aynı
   * işlemde audit'e yazılır (US-017 AC2); audit yazılamazsa ayar da yazılmaz.
   */
  async set(
    key: SettingKey,
    value: unknown,
    target: SettingTarget,
    actor: SettingActor,
  ): Promise<void> {
    if (!isSettingKey(key)) {
      throw new DomainError('SETTING_OUT_OF_RANGE', { key: String(key) });
    }
    const parsed = parseSettingValue(key, value);
    if (!parsed.ok) {
      throw new DomainError('SETTING_OUT_OF_RANGE', { key });
    }
    if (DORMANT_KEYS.has(key)) {
      await this.assertDormantOrder(key, parsed.value, target);
    }
    await this.repository.write(target, key, parsed.value, actor.userId, (tx, previous) =>
      this.audit.record(tx, {
        actor: { type: 'platform', userId: actor.userId },
        businessId: target.scope === 'business' ? target.businessId : null,
        action: 'setting.updated',
        targetType: 'setting',
        targetId: settingAuditTargetId(target, key),
        before: previous,
        after: parsed.value,
        ...(actor.context === undefined ? {} : { context: actor.context }),
      }),
    );
    await this.cache.invalidate(key, target);
  }

  /**
   * Admin ekranı (F2.19, US-017 AC1): kapsamdaki her anahtarın değeri ve mirası. Çağıranın
   * platform işleminde (`settings_admin_list` yalnız platform bağlamında çalışır). İşletme
   * kapsamında miras = işletmenin güncel planı → platform → kod varsayılanı.
   */
  async listForScopeTx(tx: Tx, target: SettingTarget): Promise<AdminSettingView[]> {
    const rows = await this.repository.listScopeTx(tx, target);
    const byScope = {
      platform: new Map<string, SettingScopeRow>(),
      plan: new Map<string, SettingScopeRow>(),
      business: new Map<string, SettingScopeRow>(),
    };
    for (const row of rows) byScope[row.scope].set(row.key, row);

    const inheritanceOrder: readonly ('plan' | 'platform')[] =
      target.scope === 'business' ? ['plan', 'platform'] : target.scope === 'plan' ? ['platform'] : [];
    return SETTING_KEYS.map((key) => {
      const own = byScope[target.scope].get(key);
      const ownValue = own === undefined ? undefined : this.validOrWarn(key, own);
      let inheritedValue: unknown = settingDefault(key);
      let inheritedFrom: SettingSource = 'default';
      for (const scope of inheritanceOrder) {
        const row = byScope[scope].get(key);
        const valid = row === undefined ? undefined : this.validOrWarn(key, row);
        if (valid !== undefined) {
          inheritedValue = valid.value;
          inheritedFrom = scope;
          break;
        }
      }
      return {
        key,
        ...settingMetaOf(key),
        scopes: settingScopesOf(key),
        value: ownValue === undefined ? null : ownValue.value,
        inheritedValue,
        inheritedFrom,
        updatedAt: ownValue === undefined ? null : (own?.updatedAt ?? null),
      };
    });
  }

  private validOrWarn(key: SettingKey, row: SettingScopeRow): { value: unknown } | undefined {
    const parsed = parseSettingValue(key, row.value);
    if (parsed.ok) return { value: parsed.value };
    this.logger.warn(
      `settings.invalid_value: kayıtlı değer geçersiz, ekranda yok sayılıyor (anahtar: ${key}, kapsam: ${row.scope})`,
    );
    return undefined;
  }

  private async loadLayers(key: SettingKey, businessId?: string): Promise<SettingLayers> {
    const cached = await this.cache.getLayers(key, businessId);
    if (cached.layers !== undefined) {
      return cached.layers;
    }
    const layers = await this.repository.read(key, businessId);
    const ttlSeconds =
      key === CACHE_TTL_KEY ? this.resolve(CACHE_TTL_KEY, layers) : await this.get(CACHE_TTL_KEY);
    await this.cache.setLayers(key, businessId, layers, ttlSeconds, cached.planVersion);
    return layers;
  }

  /** En özel kapsamdaki geçerli değer; geçersiz kayıtlı değer uyarıyla atlanır. */
  private resolve<K extends SettingKey>(key: K, layers: SettingLayers): SettingValue<K> {
    const candidates: [scope: string, present: boolean, value: unknown][] = [
      ['business', 'business' in layers, layers.business],
      ['plan', 'plan' in layers, layers.plan],
      ['platform', 'platform' in layers, layers.platform],
    ];
    for (const [scope, present, value] of candidates) {
      if (!present) continue;
      const parsed = parseSettingValue(key, value);
      if (parsed.ok) return parsed.value;
      this.logger.warn(
        `settings.invalid_value: kayıtlı değer geçersiz, bir alt katman kullanılıyor (anahtar: ${key}, kapsam: ${scope})`,
      );
    }
    return settingDefault(key);
  }

  /**
   * Aynı kapsamdaki geçerli değerlerle çapraz kural (US-017, F1.4a K4). Plan kapsamında işletme
   * olmadığından plan satırları okunamaz; kontrol platform değerleriyle yapılır (F1.4b notu).
   */
  private async assertDormantOrder(
    key: SettingKey,
    value: unknown,
    target: SettingTarget,
  ): Promise<void> {
    const businessId = target.scope === 'business' ? target.businessId : undefined;
    const current = {
      reminderDays: await this.get('dormant.reminder_days', businessId),
      warningDay: await this.get('dormant.warning_day', businessId),
      deactivateDay: await this.get('dormant.deactivate_day', businessId),
      deleteDay: await this.get('dormant.delete_day', businessId),
    };
    const next = {
      reminderDays: key === 'dormant.reminder_days' ? (value as number[]) : current.reminderDays,
      warningDay: key === 'dormant.warning_day' ? (value as number) : current.warningDay,
      deactivateDay: key === 'dormant.deactivate_day' ? (value as number) : current.deactivateDay,
      deleteDay: key === 'dormant.delete_day' ? (value as number) : current.deleteDay,
    };
    if (!checkDormantOrder(next)) {
      throw new DomainError('SETTING_OUT_OF_RANGE', { key });
    }
  }
}
