'use client';
// İşletme profili düzenleme (openapi `PATCH /api/v1/business`; F2.4, US-006). Yalnız
// `packages/api-client`. Başarılı yanıt güncel `Business`; profil sorgusu önbelleğine yazılır.
import type { BusinessProfileBody } from '@b2b/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
