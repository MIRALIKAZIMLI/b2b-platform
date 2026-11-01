// Kayıt formu listeleri ve profil doluluğu (F2.3b): `GET /catalog/regions`, `/catalog/activity-types`
// (kimliksiz) ve `GET /business` (aktif işletme, `business.manage`). Yalnız `packages/api-client`.
import type { components } from '@b2b/api-client';
import { useQuery } from '@tanstack/react-query';
import { mobileApi } from '../../lib/session';
import { activityOptions, regionOptions } from './options';

type BusinessProfile = components['schemas']['Business'];

function failure(error: unknown): Error {
  const code =
    typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
      ? error.code
      : 'INTERNAL_ERROR';
  return new Error(code);
}

export function useRegionOptions(language: string) {
  return useQuery({
    queryKey: ['catalog', 'regions', 'AZ'],
    queryFn: async () => {
      const { data, error } = await mobileApi().client.GET('/api/v1/catalog/regions', {
        params: { query: { country: 'AZ' } },
      });
      if (data === undefined) throw failure(error);
      return data;
    },
    select: (regions) => regionOptions(regions, language),
  });
}

export function useActivityOptions(language: string) {
  return useQuery({
    queryKey: ['catalog', 'activity-types'],
    queryFn: async () => {
      const { data, error } = await mobileApi().client.GET('/api/v1/catalog/activity-types');
      if (data === undefined) throw failure(error);
      return data;
    },
    select: (types) => activityOptions(types, language),
  });
}

export function useBusinessProfile(businessId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['business', 'profile', businessId ?? null],
    enabled: enabled && businessId !== undefined,
    retry: false,
    queryFn: async (): Promise<BusinessProfile> => {
      const { data, error } = await mobileApi().client.GET('/api/v1/business', {
        params: { header: { 'X-Business-Id': businessId ?? '' } },
      });
      if (data === undefined) throw failure(error);
      return data;
    },
  });
}
