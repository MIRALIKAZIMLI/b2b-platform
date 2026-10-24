import type { SettingKey } from '@b2b/shared';

/** Ayarın yazılacağı kapsam. Plan kapsamı F1.4b'de eklenir. */
export type SettingTarget =
  { readonly scope: 'platform' } | { readonly scope: 'business'; readonly businessId: string };

/**
 * Bir anahtarın veritabanındaki ham değerleri (doğrulanmamış jsonb). Alan yoksa o kapsamda
 * satır yoktur. Çözümleme sırası: işletme → platform → kod varsayılanı.
 */
export interface SettingLayers {
  readonly platform?: unknown;
  readonly business?: unknown;
}

export interface SettingsRepositoryPort {
  read(key: SettingKey, businessId?: string): Promise<SettingLayers>;
  write(target: SettingTarget, key: SettingKey, value: unknown, userId: string): Promise<void>;
}

export interface SettingsCachePort {
  /** Önbellekte bütün katmanlar varsa döner; yoksa veya Redis hata verirse undefined. */
  getLayers(key: SettingKey, businessId?: string): Promise<SettingLayers | undefined>;
  setLayers(
    key: SettingKey,
    businessId: string | undefined,
    layers: SettingLayers,
    ttlSeconds: number,
  ): Promise<void>;
  invalidate(key: SettingKey, target: SettingTarget): Promise<void>;
}
