'use client';
// Toptancı ayarları (F2.6, US-011): openapi `/api/v1/warehouses*`, `/api/v1/business/seller-profile`,
// `/api/v1/business/service-areas`. Yalnızca `packages/api-client`. Başarılı yazımlar ilgili sorgu
// önbelleğini günceller; depo değişikliği (varsayılan) satıcı profilini de etkilediği için o da yenilenir.
import type { components } from '@b2b/api-client';
import type { SellerProfileBody } from '@b2b/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { webApi } from '../../lib/session';
import { ApiError } from '../admin-sellers/api';

export type Warehouse = components['schemas']['Warehouse'];
export type SellerProfile = components['schemas']['SellerProfile'];

const WAREHOUSES_KEY = ['seller', 'warehouses'] as const;
const SELLER_PROFILE_KEY = ['seller', 'profile'] as const;
const SERVICE_AREAS_KEY = ['seller', 'service-areas'] as const;

const header = (businessId: string | undefined) => ({
  header: { 'X-Business-Id': businessId ?? '' },
});

export function useWarehouses(businessId: string | undefined) {
  return useQuery({
    queryKey: [...WAREHOUSES_KEY, businessId ?? null],
    enabled: businessId !== undefined,
    retry: false,
    queryFn: async (): Promise<Warehouse[]> => {
      const { data, error, response } = await webApi.client.GET('/api/v1/warehouses', {
        params: header(businessId),
      });
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
  });
}

export interface WarehouseChange {
  readonly id: string;
  readonly body: {
    name?: string;
    addressLine?: string | null;
    isDefault?: true;
    status?: 'active' | 'inactive';
  };
}

export function useWarehouseMutations(businessId: string | undefined) {
  const queryClient = useQueryClient();
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: [...WAREHOUSES_KEY, businessId ?? null] });
    await queryClient.invalidateQueries({ queryKey: [...SELLER_PROFILE_KEY, businessId ?? null] });
  };
  const create = useMutation({
    mutationFn: async (body: { name: string; addressLine?: string }): Promise<Warehouse> => {
      const { data, error, response } = await webApi.client.POST('/api/v1/warehouses', {
        params: header(businessId),
        body,
      });
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: async ({ id, body }: WarehouseChange): Promise<Warehouse> => {
      const { data, error, response } = await webApi.client.PATCH('/api/v1/warehouses/{id}', {
        params: { ...header(businessId), path: { id } },
        body,
      });
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
    onSuccess: refresh,
  });
  return { create, update };
}

export function useSellerProfile(businessId: string | undefined) {
  return useQuery({
    queryKey: [...SELLER_PROFILE_KEY, businessId ?? null],
    enabled: businessId !== undefined,
    retry: false,
    queryFn: async (): Promise<SellerProfile> => {
      const { data, error, response } = await webApi.client.GET('/api/v1/business/seller-profile', {
        params: header(businessId),
      });
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
  });
}

export function useUpdateSellerProfile(businessId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: SellerProfileBody): Promise<SellerProfile> => {
      const { data, error, response } = await webApi.client.PATCH(
        '/api/v1/business/seller-profile',
        { params: header(businessId), body },
      );
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
    onSuccess: (profile) => {
      queryClient.setQueryData([...SELLER_PROFILE_KEY, businessId ?? null], profile);
    },
  });
}

export function useServiceAreas(businessId: string | undefined) {
  return useQuery({
    queryKey: [...SERVICE_AREAS_KEY, businessId ?? null],
    enabled: businessId !== undefined,
    retry: false,
    queryFn: async (): Promise<string[]> => {
      const { data, error, response } = await webApi.client.GET('/api/v1/business/service-areas', {
        params: header(businessId),
      });
      if (data === undefined) throw new ApiError(error, response.status);
      return data.regionIds;
    },
  });
}

export function useReplaceServiceAreas(businessId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (regionIds: string[]): Promise<string[]> => {
      const { data, error, response } = await webApi.client.PUT('/api/v1/business/service-areas', {
        params: header(businessId),
        body: { regionIds },
      });
      if (data === undefined) throw new ApiError(error, response.status);
      return data.regionIds;
    },
    onSuccess: (regionIds) => {
      queryClient.setQueryData([...SERVICE_AREAS_KEY, businessId ?? null], regionIds);
    },
  });
}
