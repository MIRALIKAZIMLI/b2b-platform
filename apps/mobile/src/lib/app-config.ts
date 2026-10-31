// Açılışta sürüm kontrolü (US-060, F1.14b). `GET /api/app-config` sürümsüz uçtur: eski bir
// uygulama da okuyabilsin diye `/api/v1` değişikliklerinden etkilenmez. Karar saf fonksiyonda.
import type { ApiClient } from '@b2b/api-client';
import { compareVersions, isAppVersion } from '@b2b/shared';

export type AppPlatform = 'ios' | 'android';

export const APP_CONFIG_KEY = ['app-config'] as const;

/** `GET /api/app-config` 200 gövdesi; ağ hatası veya 2xx dışı → `undefined` (uygulama engellenmez). */
export async function getAppConfig(client: ApiClient, platform: AppPlatform, version: string) {
  const { data } = await client.GET('/api/app-config', {
    params: { query: { platform, version } },
  });
  return data;
}

export type AppConfig = NonNullable<Awaited<ReturnType<typeof getAppConfig>>>;

export type UpdateDecision =
  | { readonly kind: 'none' }
  | { readonly kind: 'required'; readonly storeUrl?: string }
  | { readonly kind: 'recommended'; readonly storeUrl?: string };

/**
 * - US-060 AC1: sunucu `updateRequired` derse (veya sürüm minimumun altındaysa) zorunlu güncelleme.
 * - US-060 AC2: minimum karşılanıyor, önerilen daha yeniyse kapatılabilir öneri; kapatılınca yok.
 * Yanıt yoksa uygulama engellenmez.
 */
export function decideUpdate(
  config: AppConfig | undefined,
  currentVersion: string,
  dismissed: boolean,
): UpdateDecision {
  if (config === undefined || !isAppVersion(currentVersion)) return { kind: 'none' };
  const link = config.storeUrl === undefined ? {} : { storeUrl: config.storeUrl };
  const below = (target: string) =>
    isAppVersion(target) && compareVersions(currentVersion, target) < 0;
  if (config.updateRequired || below(config.minVersion)) return { kind: 'required', ...link };
  if (below(config.recommendedVersion) && !dismissed) return { kind: 'recommended', ...link };
  return { kind: 'none' };
}
