// İşletme profili düzenleme (openapi `PATCH /api/v1/business`; F2.4, US-006). Yalnız
// `packages/api-client`. Başarılı yanıt güncel `Business`; profil sorgusu önbelleğine yazılır.
// Hata, API gövdesi (`code`, `details`) taşıyan `ProfileSaveError` olarak döner.
import type { components } from '@b2b/api-client';
import type { BusinessProfileBody, PrivacySettings } from '@b2b/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { mobileApi } from '../../lib/session';

type BusinessProfile = components['schemas']['Business'];

export class ProfileSaveError extends Error {
  constructor(readonly body: unknown) {
    super('PROFILE_SAVE_FAILED');
  }
}

export function useUpdateBusinessProfile(businessId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: BusinessProfileBody): Promise<BusinessProfile> => {
      const { data, error } = await mobileApi().client.PATCH('/api/v1/business', {
        params: { header: { 'X-Business-Id': businessId ?? '' } },
        body,
      });
      if (data === undefined) throw new ProfileSaveError(error);
      return data;
    },
    onSuccess: (profile) => {
      queryClient.setQueryData(['business', 'profile', businessId ?? null], profile);
    },
  });
}

// Görünürlük ayarları (openapi `GET|PUT /api/v1/business/privacy`; F2.10, US-007).
export function usePrivacySettings(businessId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['business', 'privacy', businessId ?? null],
    enabled: enabled && businessId !== undefined,
    retry: false,
    queryFn: async (): Promise<PrivacySettings> => {
      const { data, error } = await mobileApi().client.GET('/api/v1/business/privacy', {
        params: { header: { 'X-Business-Id': businessId ?? '' } },
      });
      if (data === undefined) throw new ProfileSaveError(error);
      return data;
    },
  });
}

export function useUpdatePrivacy(businessId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: PrivacySettings): Promise<PrivacySettings> => {
      const { data, error } = await mobileApi().client.PUT('/api/v1/business/privacy', {
        params: { header: { 'X-Business-Id': businessId ?? '' } },
        body,
      });
      if (data === undefined) throw new ProfileSaveError(error);
      return data;
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(['business', 'privacy', businessId ?? null], settings);
    },
  });
}
