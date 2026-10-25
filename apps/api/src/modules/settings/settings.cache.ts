import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SettingKey } from '@b2b/shared';
import { REDIS_CLIENT } from '../../infrastructure/redis';
import type {
  SettingLayers,
  SettingsCacheLookup,
  SettingsCachePort,
  SettingTarget,
} from './settings.ports';

/** Kullanılan Redis komutları (ioredis `Redis` bu arayüze uyar; testte bellek karşılığı). */
export interface SettingsRedis {
  mget(...keys: string[]): Promise<(string | null)[]>;
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<'OK'>;
  del(...keys: string[]): Promise<number>;
  incr(key: string): Promise<number>;
}

/** `settings:<scope>:<id>:<key>`; platform kapsamında id yerine `-`. */
export function settingsCacheKey(key: SettingKey, target: SettingTarget): string {
  const id =
    target.scope === 'business' ? target.businessId : target.scope === 'plan' ? target.planId : '-';
  return `settings:${target.scope}:${id}:${key}`;
}

/** Anahtarın plan sürüm sayacı; plan kapsamlı her yazımda artar. */
export function settingsPlanVersionKey(key: SettingKey): string {
  return `settings:plan-version:${key}`;
}

/** Sayaç hiç artmadıysa sürüm `0`. */
const INITIAL_PLAN_VERSION = '0';

interface StoredLayer {
  readonly v?: unknown;
}

/**
 * İşletme kaydı: işletme ve plan katmanı birlikte, yazıldıkları andaki plan sürümüyle.
 * Plan katmanı işletmenin aboneliğine bağlı olduğu için işletme kaydında tutulur (F1.4b).
 */
interface StoredBusinessEntry {
  readonly business: StoredLayer;
  readonly plan: StoredLayer;
  readonly planVersion: string;
}

/** Katman değeri `{"v": …}` olarak, satırı olmayan katman `{}` olarak saklanır. */
function encodeLayer(present: boolean, value: unknown): StoredLayer {
  return present ? { v: value } : {};
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function decodeLayer(raw: unknown): { present: boolean; value: unknown } {
  if (isObject(raw) && 'v' in raw) {
    return { present: true, value: raw.v };
  }
  return { present: false, value: undefined };
}

function decodeBusinessEntry(raw: string): StoredBusinessEntry | undefined {
  const parsed: unknown = JSON.parse(raw);
  if (!isObject(parsed) || typeof parsed.planVersion !== 'string') return undefined;
  return {
    business: isObject(parsed.business) ? parsed.business : {},
    plan: isObject(parsed.plan) ? parsed.plan : {},
    planVersion: parsed.planVersion,
  };
}

/** Hata kodu veya adı; mesaj yazılmaz (adres içerebilir). */
function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return typeof error.code === 'string' ? error.code : 'unknown';
  }
  return error instanceof Error ? error.name : 'unknown';
}

/**
 * Ayar önbelleği (Redis). Platform katmanı ve işletme kaydı (işletme + plan katmanı) ayrı
 * anahtarlardır; `set` yalnızca yazılan kapsamı geçersiz kılar. Plan kapsamlı yazım anahtarın
 * plan sürümünü artırır: eski sürümle yazılmış işletme kayıtları okunmaz.
 * Redis yoksa veya hata verirse istisna atılmaz: okuma veritabanına düşer, uyarı loglanır.
 */
@Injectable()
export class SettingsCache implements SettingsCachePort {
  private readonly logger = new Logger(SettingsCache.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: SettingsRedis) {}

  async getLayers(key: SettingKey, businessId?: string): Promise<SettingsCacheLookup> {
    const keys = [settingsCacheKey(key, { scope: 'platform' })];
    if (businessId !== undefined) {
      keys.push(
        settingsCacheKey(key, { scope: 'business', businessId }),
        settingsPlanVersionKey(key),
      );
    }
    try {
      const [platformRaw, businessRaw, versionRaw] = await this.redis.mget(...keys);
      const planVersion = versionRaw ?? INITIAL_PLAN_VERSION;
      if (platformRaw === null || platformRaw === undefined) {
        return { layers: undefined, planVersion };
      }
      const layers: { platform?: unknown; plan?: unknown; business?: unknown } = {};
      const platform = decodeLayer(JSON.parse(platformRaw));
      if (platform.present) layers.platform = platform.value;
      if (businessId !== undefined) {
        if (businessRaw === null || businessRaw === undefined) {
          return { layers: undefined, planVersion };
        }
        const entry = decodeBusinessEntry(businessRaw);
        if (entry?.planVersion !== planVersion) {
          return { layers: undefined, planVersion };
        }
        const business = decodeLayer(entry.business);
        const plan = decodeLayer(entry.plan);
        if (business.present) layers.business = business.value;
        if (plan.present) layers.plan = plan.value;
      }
      return { layers, planVersion };
    } catch (error: unknown) {
      this.warn('get', error);
      return { layers: undefined, planVersion: INITIAL_PLAN_VERSION };
    }
  }

  async setLayers(
    key: SettingKey,
    businessId: string | undefined,
    layers: SettingLayers,
    ttlSeconds: number,
    planVersion: string,
  ): Promise<void> {
    try {
      await this.redis.set(
        settingsCacheKey(key, { scope: 'platform' }),
        JSON.stringify(encodeLayer('platform' in layers, layers.platform)),
        'EX',
        ttlSeconds,
      );
      if (businessId !== undefined) {
        const entry: StoredBusinessEntry = {
          business: encodeLayer('business' in layers, layers.business),
          plan: encodeLayer('plan' in layers, layers.plan),
          planVersion,
        };
        await this.redis.set(
          settingsCacheKey(key, { scope: 'business', businessId }),
          JSON.stringify(entry),
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
      if (target.scope === 'plan') {
        await this.redis.incr(settingsPlanVersionKey(key));
      } else {
        await this.redis.del(settingsCacheKey(key, target));
      }
    } catch (error: unknown) {
      // Geçersiz kılınamayan kayıt en geç önbellek ömrü (settings.cache_ttl_seconds) sonunda yenilenir.
      this.warn('invalidate', error);
    }
  }

  private warn(operation: string, error: unknown): void {
    this.logger.warn(
      `settings.cache_unavailable: Redis kullanılamadı, veritabanı kullanılıyor (işlem: ${operation}, kod: ${errorCode(error)})`,
    );
  }
}
