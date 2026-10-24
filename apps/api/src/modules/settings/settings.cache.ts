import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SettingKey } from '@b2b/shared';
import { REDIS_CLIENT } from '../../infrastructure/redis';
import type { SettingLayers, SettingsCachePort, SettingTarget } from './settings.ports';

/** Kullanılan Redis komutları (ioredis `Redis` bu arayüze uyar; testte bellek karşılığı). */
export interface SettingsRedis {
  mget(...keys: string[]): Promise<(string | null)[]>;
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<'OK'>;
  del(...keys: string[]): Promise<number>;
}

/** `settings:<scope>:<id>:<key>`; platform kapsamında id yerine `-`. */
export function settingsCacheKey(key: SettingKey, target: SettingTarget): string {
  const id = target.scope === 'business' ? target.businessId : '-';
  return `settings:${target.scope}:${id}:${key}`;
}

/** Katman değeri `{"v": …}` olarak, satırı olmayan katman `{}` olarak saklanır. */
function encodeLayer(present: boolean, value: unknown): string {
  return JSON.stringify(present ? { v: value } : {});
}

function decodeLayer(raw: string): { present: boolean; value: unknown } {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed === 'object' && parsed !== null && 'v' in parsed) {
    return { present: true, value: parsed.v };
  }
  return { present: false, value: undefined };
}

/** Hata kodu veya adı; mesaj yazılmaz (adres içerebilir). */
function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return typeof error.code === 'string' ? error.code : 'unknown';
  }
  return error instanceof Error ? error.name : 'unknown';
}

/**
 * Ayar önbelleği (Redis). Her kapsam ayrı anahtardır; `set` yalnızca yazılan kapsamı siler.
 * Redis yoksa veya hata verirse istisna atılmaz: okuma veritabanına düşer, uyarı loglanır.
 */
@Injectable()
export class SettingsCache implements SettingsCachePort {
  private readonly logger = new Logger(SettingsCache.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: SettingsRedis) {}

  async getLayers(key: SettingKey, businessId?: string): Promise<SettingLayers | undefined> {
    const keys = [settingsCacheKey(key, { scope: 'platform' })];
    if (businessId !== undefined) {
      keys.push(settingsCacheKey(key, { scope: 'business', businessId }));
    }
    try {
      const [platformRaw, businessRaw] = await this.redis.mget(...keys);
      if (platformRaw === null || platformRaw === undefined) return undefined;
      const layers: { platform?: unknown; business?: unknown } = {};
      const platform = decodeLayer(platformRaw);
      if (platform.present) layers.platform = platform.value;
      if (businessId !== undefined) {
        if (businessRaw === null || businessRaw === undefined) return undefined;
        const business = decodeLayer(businessRaw);
        if (business.present) layers.business = business.value;
      }
      return layers;
    } catch (error: unknown) {
      this.warn('get', error);
      return undefined;
    }
  }

  async setLayers(
    key: SettingKey,
    businessId: string | undefined,
    layers: SettingLayers,
    ttlSeconds: number,
  ): Promise<void> {
    try {
      await this.redis.set(
        settingsCacheKey(key, { scope: 'platform' }),
        encodeLayer('platform' in layers, layers.platform),
        'EX',
        ttlSeconds,
      );
      if (businessId !== undefined) {
        await this.redis.set(
          settingsCacheKey(key, { scope: 'business', businessId }),
          encodeLayer('business' in layers, layers.business),
          'EX',
          ttlSeconds,
        );
      }
    } catch (error: unknown) {
      this.warn('set', error);
    }
  }

  async invalidate(key: SettingKey, target: SettingTarget): Promise<void> {
    try {
      await this.redis.del(settingsCacheKey(key, target));
    } catch (error: unknown) {
      // Silinemeyen anahtar en geç önbellek ömrü (settings.cache_ttl_seconds) sonunda yenilenir.
      this.warn('invalidate', error);
    }
  }

  private warn(operation: string, error: unknown): void {
    this.logger.warn(
      `settings.cache_unavailable: Redis kullanılamadı, veritabanı kullanılıyor (işlem: ${operation}, kod: ${errorCode(error)})`,
    );
  }
}
