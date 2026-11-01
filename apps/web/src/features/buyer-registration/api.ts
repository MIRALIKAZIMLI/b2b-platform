'use client';
// Perakendeci kaydı (openapi `POST /api/v1/buyers/register`, `GET /api/v1/catalog/activity-types`;
// F2.3a) ve aktif işletme profili (`GET /api/v1/business`, F2.3b). Yalnız `packages/api-client`.
import type { components } from '@b2b/api-client';
import { type BuyerRegisterBody, pickLocalizedText } from '@b2b/shared';
import { useQuery } from '@tanstack/react-query';
import { webApi } from '../../lib/session';
import { ApiError, type Option } from '../admin-sellers/api';

type ActivityType = components['schemas']['ActivityType'];
export type BusinessProfile = components['schemas']['Business'];

/** Faaliyet türleri arayüz dilinde (sıra API'den, `sortOrder`). */
export function activityTypeOptions(types: readonly ActivityType[], locale: string): Option[] {
  return types.map((type) => ({
    id: type.id,
    label: pickLocalizedText(type.name, locale) ?? type.id,
  }));
}

export function useActivityTypeOptions(locale: string) {
  return useQuery({
    queryKey: ['catalog', 'activity-types'],
    queryFn: async () => {
      const { data, error, response } = await webApi.client.GET('/api/v1/catalog/activity-types');
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
    select: (types) => activityTypeOptions(types, locale),
  });
}

export type RegisterResult =
  | { readonly kind: 'signed_in'; readonly accessToken: string }
  /** Aynı anahtarla tekrar (zayıf ağ): kayıt var, oturum yalnız ilk yanıtta açılır (F2.3a K6). */
  | { readonly kind: 'registered' }
  /** Sunucu yanıt verdi ama reddetti: `error` = API hata gövdesi. */
  | { readonly kind: 'rejected'; readonly error: unknown };

/**
 * Kayıt isteği. Kayıt anahtarı (`pendingToken`) yalnız bu çağrının başlığında; erişim anahtarı
 * yoktur (oturum henüz açılmadı). Ağ hatası istisna olarak çağırana gider (anahtar korunur).
 */
export async function registerBuyer(
  pendingToken: string,
  body: BuyerRegisterBody,
  idempotencyKey: string,
): Promise<RegisterResult> {
  const { data, error } = await webApi.client.POST('/api/v1/buyers/register', {
    params: { header: { 'Idempotency-Key': idempotencyKey } },
    headers: { Authorization: `Bearer ${pendingToken}` },
    body,
  });
  if (data === undefined) return { kind: 'rejected', error };
  return data.accessToken === undefined
    ? { kind: 'registered' }
    : { kind: 'signed_in', accessToken: data.accessToken };
}

export const BUSINESS_PROFILE_KEY = ['business', 'profile'] as const;

/** Aktif işletmenin profili; yalnız `business.manage` izniyle (US-005 AC2 kartı). */
export function useBusinessProfile(businessId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [...BUSINESS_PROFILE_KEY, businessId ?? null],
    enabled: enabled && businessId !== undefined,
    retry: false,
    queryFn: async (): Promise<BusinessProfile> => {
      const { data, error, response } = await webApi.client.GET('/api/v1/business', {
        params: { header: { 'X-Business-Id': businessId ?? '' } },
      });
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
  });
}
