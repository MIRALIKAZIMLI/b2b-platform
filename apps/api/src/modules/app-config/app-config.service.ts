import { Inject, Injectable } from '@nestjs/common';
import { compareVersions } from '@b2b/shared';
import { SettingsService } from '../settings';

export type MobilePlatform = 'ios' | 'android';

/** openapi `/api/app-config` 200 gövdesi. `storeUrl` ayarlanmamışsa (boş) alan yoktur. */
export interface AppConfig {
  readonly minVersion: string;
  readonly recommendedVersion: string;
  readonly updateRequired: boolean;
  readonly storeUrl?: string;
  readonly maintenance: boolean;
}

/**
 * Mobil sürüm kontrolü (US-060, F1.14b). Değerler platform ayarlarından (`SettingsService`,
 * işletme bağlamı yok). Önerilen sürüm minimumdan düşük ayarlanmışsa minimum kullanılır.
 */
@Injectable()
export class AppConfigService {
  constructor(@Inject(SettingsService) private readonly settings: SettingsService) {}

  async get(platform: MobilePlatform, version: string): Promise<AppConfig> {
    const [minVersion, recommended, storeUrl, maintenance] = await Promise.all([
      this.settings.get(`mobile.min_version.${platform}`),
      this.settings.get(`mobile.recommended_version.${platform}`),
      this.settings.get(`mobile.store_url.${platform}`),
      this.settings.get('system.maintenance'),
    ]);
    const recommendedVersion =
      compareVersions(recommended, minVersion) < 0 ? minVersion : recommended;
    return {
      minVersion,
      recommendedVersion,
      updateRequired: compareVersions(version, minVersion) < 0,
      ...(storeUrl === '' ? {} : { storeUrl }),
      maintenance,
    };
  }
}
