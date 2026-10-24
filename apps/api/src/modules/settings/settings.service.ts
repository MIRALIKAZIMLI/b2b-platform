import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  checkDormantOrder,
  DORMANT_SETTING_KEYS,
  isSettingKey,
  parseSettingValue,
  type SettingKey,
  type SettingValue,
  settingDefault,
} from '@b2b/shared';
import { DomainError } from '../../core/errors/domain-error';
import { SettingsCache } from './settings.cache';
import type {
  SettingLayers,
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
}

/**
 * Katmanlı ayarlar (ADR-0009). Çözümleme: işletme → platform → kod varsayılanı
 * (plan katmanı F1.4b'de). Değer tipi ve sınırı `@b2b/shared` ayar kaydından gelir.
 */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    @Inject(SettingsRepository) private readonly repository: SettingsRepositoryPort,
    @Inject(SettingsCache) private readonly cache: SettingsCachePort,
  ) {}

  async get<K extends SettingKey>(key: K, businessId?: string): Promise<SettingValue<K>> {
    const layers = await this.loadLayers(key, businessId);
    return this.resolve(key, layers);
  }

  /**
   * Değeri doğrular ve yazar (yalnızca platform bağlamı; işletme kendi ayarını yazamaz).
   * Tip, sınır veya çapraz kural ihlali → `SETTING_OUT_OF_RANGE`. Audit kaydı F1.9'da.
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
    await this.repository.write(target, key, parsed.value, actor.userId);
    await this.cache.invalidate(key, target);
  }

  private async loadLayers(key: SettingKey, businessId?: string): Promise<SettingLayers> {
    const cached = await this.cache.getLayers(key, businessId);
    if (cached !== undefined) {
      return cached;
    }
    const layers = await this.repository.read(key, businessId);
    const ttlSeconds =
      key === CACHE_TTL_KEY ? this.resolve(CACHE_TTL_KEY, layers) : await this.get(CACHE_TTL_KEY);
    await this.cache.setLayers(key, businessId, layers, ttlSeconds);
    return layers;
  }

  /** En özel kapsamdaki geçerli değer; geçersiz kayıtlı değer uyarıyla atlanır. */
  private resolve<K extends SettingKey>(key: K, layers: SettingLayers): SettingValue<K> {
    const candidates: [scope: string, present: boolean, value: unknown][] = [
      ['business', 'business' in layers, layers.business],
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

  /** Aynı kapsamdaki geçerli değerlerle çapraz kural (US-017, F1.4a K4). */
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
