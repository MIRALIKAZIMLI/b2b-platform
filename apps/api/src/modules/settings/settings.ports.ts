import type { SettingKey } from '@b2b/shared';

/** Ayarın yazılacağı kapsam (ADR-0009: işletme → plan → platform). */
export type SettingTarget =
  | { readonly scope: 'platform' }
  | { readonly scope: 'plan'; readonly planId: string }
  | { readonly scope: 'business'; readonly businessId: string };

/**
 * Bir anahtarın veritabanındaki ham değerleri (doğrulanmamış jsonb). Alan yoksa o kapsamda
 * satır yoktur. `plan`, işletmenin güncel aboneliğinin planındaki satırdır (F1.4b).
 * Çözümleme sırası: işletme → plan → platform → kod varsayılanı.
 */
export interface SettingLayers {
  readonly platform?: unknown;
  readonly plan?: unknown;
  readonly business?: unknown;
}

/** Önbellek okuması: katmanlar (yoksa undefined) ve okuma anındaki plan sürümü. */
export interface SettingsCacheLookup {
  readonly layers: SettingLayers | undefined;
  /**
   * Anahtarın plan sürüm sayacı. Veritabanından okunan katmanlar bu sürümle önbelleğe yazılır;
   * arada plan kapsamlı yazım olursa sürüm değişir ve kayıt bir sonraki okumada kullanılmaz.
   */
  readonly planVersion: string;
}

export interface SettingsRepositoryPort {
  read(key: SettingKey, businessId?: string): Promise<SettingLayers>;
  write(target: SettingTarget, key: SettingKey, value: unknown, userId: string): Promise<void>;
}

export interface SettingsCachePort {
  /** Önbellekte bütün katmanlar geçerliyse `layers` doludur; yoksa veya Redis hata verirse undefined. */
  getLayers(key: SettingKey, businessId?: string): Promise<SettingsCacheLookup>;
  setLayers(
    key: SettingKey,
    businessId: string | undefined,
    layers: SettingLayers,
    ttlSeconds: number,
    planVersion: string,
  ): Promise<void>;
  invalidate(key: SettingKey, target: SettingTarget): Promise<void>;
}
