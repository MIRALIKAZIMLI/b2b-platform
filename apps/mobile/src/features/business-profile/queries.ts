// İşletme profili düzenleme (openapi `PATCH /api/v1/business`; F2.4, US-006). Yalnız
// `packages/api-client`. Başarılı yanıt güncel `Business`; profil sorgusu önbelleğine yazılır.
// Hata, API gövdesi (`code`, `details`) taşıyan `ProfileSaveError` olarak döner.
import type { components } from '@b2b/api-client';
import type { BusinessProfileBody } from '@b2b/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
