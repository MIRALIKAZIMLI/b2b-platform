import type { SettingKey } from '@b2b/shared';
import type { Tx } from '../../core/db';

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

/** Bir kapsamın ekran okuması için ham satır (`settings_admin_list`, F2.19). */
export interface SettingScopeRow {
  readonly scope: 'platform' | 'plan' | 'business';
  readonly key: string;
  readonly value: unknown;
  readonly updatedAt: Date;
}

export interface SettingsRepositoryPort {
  read(key: SettingKey, businessId?: string): Promise<SettingLayers>;
  /** Çağıranın platform işleminde kapsamın (ve mirasının) bütün satırları (F2.19). */
  listScopeTx(tx: Tx, target: SettingTarget): Promise<SettingScopeRow[]>;
  /**
   * Değeri yazar ve aynı işlemde `afterWrite(tx, previous)` çağırır (audit, US-017 AC2).
   * `previous` aynı kapsamdaki önceki ham değerdir; satır yoksa null. `afterWrite` hata verirse
   * yazım geri alınır.
   */
  write(
    target: SettingTarget,
    key: SettingKey,
    value: unknown,
    userId: string,
    afterWrite: SettingWriteHook,
  ): Promise<void>;
}

export type SettingWriteHook = (tx: Tx, previous: unknown) => Promise<void>;

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
