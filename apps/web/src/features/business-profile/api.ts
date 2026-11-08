'use client';
// İşletme profili düzenleme (openapi `PATCH /api/v1/business`; F2.4, US-006). Yalnız
// `packages/api-client`. Başarılı yanıt güncel `Business`; profil sorgusu önbelleğine yazılır.
import type { BusinessProfileBody, PrivacySettings } from '@b2b/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { webApi } from '../../lib/session';
import { ApiError } from '../admin-sellers/api';
import { BUSINESS_PROFILE_KEY, type BusinessProfile } from '../buyer-registration/api';

export function useUpdateBusinessProfile(businessId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: BusinessProfileBody): Promise<BusinessProfile> => {
      const { data, error, response } = await webApi.client.PATCH('/api/v1/business', {
        params: { header: { 'X-Business-Id': businessId ?? '' } },
        body,
      });
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
    onSuccess: (profile) => {
      queryClient.setQueryData([...BUSINESS_PROFILE_KEY, businessId ?? null], profile);
    },
  });
}

// Görünürlük ayarları (openapi `GET|PUT /api/v1/business/privacy`; F2.10, US-007).
export const PRIVACY_KEY = ['business', 'privacy'] as const;

export function usePrivacySettings(businessId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [...PRIVACY_KEY, businessId ?? null],
    enabled: enabled && businessId !== undefined,
    retry: false,
    queryFn: async (): Promise<PrivacySettings> => {
      const { data, error, response } = await webApi.client.GET('/api/v1/business/privacy', {
        params: { header: { 'X-Business-Id': businessId ?? '' } },
      });
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
  });
}

export function useUpdatePrivacy(businessId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: PrivacySettings): Promise<PrivacySettings> => {
      const { data, error, response } = await webApi.client.PUT('/api/v1/business/privacy', {
        params: { header: { 'X-Business-Id': businessId ?? '' } },
        body,
      });
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
    onSuccess: (settings) => {
      queryClient.setQueryData([...PRIVACY_KEY, businessId ?? null], settings);
    },
  });
}
