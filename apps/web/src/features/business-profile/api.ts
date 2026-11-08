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

/** Logo için kabul edilen türler (API `files` ile aynı, NFR-49). */
export const LOGO_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

/**
 * Yükleme adresi API'nin kendi yoluysa (`/api/v1/...`, yerel disk deposu) aynı kökenden çağrılır
 * (Next rewrite; tarayıcı CORS'a takılmaz). R2 gibi başka bir alan adı olduğu gibi kullanılır.
 */
function sameOriginUploadUrl(url: string): string {
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.pathname.startsWith('/api/v1/') ? `${parsed.pathname}${parsed.search}` : url;
  } catch {
    return url;
  }
}

/**
 * Logo yükleme (F2.10b, SF-09): yükleme adresi → dosyayı PUT → `complete` (boyut + imza) →
 * `PATCH /business { logoFileId }`. `null` logoyu kaldırır. Sonuç profil önbelleğine yazılır.
 */
export function useSetLogo(businessId: string | undefined) {
  const queryClient = useQueryClient();
  const header = { 'X-Business-Id': businessId ?? '' };
  return useMutation({
    mutationFn: async (file: File | null): Promise<BusinessProfile> => {
      let logoFileId: string | null = null;
      if (file !== null) {
        const upload = await webApi.client.POST('/api/v1/files/upload-url', {
          params: { header },
          body: { purpose: 'logo', contentType: file.type, sizeBytes: file.size },
        });
        if (upload.data === undefined) throw new ApiError(upload.error, upload.response.status);
        const put = await fetch(sameOriginUploadUrl(upload.data.uploadUrl), {
          method: 'PUT',
          headers: upload.data.headers,
          body: file,
        });
        if (!put.ok) throw new ApiError(undefined, put.status);
        const done = await webApi.client.POST('/api/v1/files/{id}/complete', {
          params: { header, path: { id: upload.data.fileId } },
        });
        if (done.data === undefined) throw new ApiError(done.error, done.response.status);
        logoFileId = upload.data.fileId;
      }
      const { data, error, response } = await webApi.client.PATCH('/api/v1/business', {
        params: { header },
        body: { logoFileId },
      });
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
    onSuccess: (profile) => {
      queryClient.setQueryData([...BUSINESS_PROFILE_KEY, businessId ?? null], profile);
    },
  });
}
