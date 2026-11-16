'use client';
// Admin kategori, marka ve faaliyet alanı ekranları (F3.2b, US-029): openapi
// `/api/v1/admin/catalog/{categories,brands,activity-types}*`. Yalnızca `packages/api-client`
// üzerinden (coding-guidelines §9.1). Silme ucu yoktur (R38): yalnız `isActive`.
import type { components } from '@b2b/api-client';
import type { BrandStatus, TaxonomyFormBody } from '@b2b/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { webApi } from '../../lib/session';
import { ApiError } from '../admin-sellers/api';

export type AdminCategory = components['schemas']['Category'];
export type AdminBrand = components['schemas']['AdminBrand'];
export type AdminActivityType = components['schemas']['ActivityTypeAdmin'];

export interface EntryPatch {
  name?: TaxonomyFormBody['name'];
  sortOrder?: number;
  isActive?: boolean;
}

export interface BrandPatch {
  name?: string;
  status?: 'active' | 'rejected';
  isActive?: boolean;
}

const CATEGORIES_KEY = ['admin', 'catalog', 'categories'] as const;
const BRANDS_KEY = ['admin', 'catalog', 'brands'] as const;
const ACTIVITY_TYPES_KEY = ['admin', 'catalog', 'activity-types'] as const;

export function useAdminCategories() {
  return useQuery({
    queryKey: CATEGORIES_KEY,
    retry: false,
    queryFn: async (): Promise<AdminCategory[]> => {
      const { data, error, response } = await webApi.client.GET('/api/v1/admin/catalog/categories');
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
  });
}

export function useCategoryMutations() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY });
  const create = useMutation({
    mutationFn: async (
      body: TaxonomyFormBody & { parentId: string | null },
    ): Promise<AdminCategory> => {
      const { data, error, response } = await webApi.client.POST(
        '/api/v1/admin/catalog/categories',
        { body },
      );
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: EntryPatch }): Promise<AdminCategory> => {
      const { data, error, response } = await webApi.client.PATCH(
        '/api/v1/admin/catalog/categories/{id}',
        { params: { path: { id } }, body },
      );
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
    onSuccess: refresh,
  });
  return { create, update };
}

export function useAdminActivityTypes() {
  return useQuery({
    queryKey: ACTIVITY_TYPES_KEY,
    retry: false,
    queryFn: async (): Promise<AdminActivityType[]> => {
      const { data, error, response } = await webApi.client.GET(
        '/api/v1/admin/catalog/activity-types',
      );
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
  });
}

export function useActivityTypeMutations() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ACTIVITY_TYPES_KEY });
  const create = useMutation({
    mutationFn: async (body: TaxonomyFormBody): Promise<AdminActivityType> => {
      const { data, error, response } = await webApi.client.POST(
        '/api/v1/admin/catalog/activity-types',
        { body },
      );
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string;
      body: EntryPatch;
    }): Promise<AdminActivityType> => {
      const { data, error, response } = await webApi.client.PATCH(
        '/api/v1/admin/catalog/activity-types/{id}',
        { params: { path: { id } }, body },
      );
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
    onSuccess: refresh,
  });
  return { create, update };
}

export function useAdminBrands(status: BrandStatus, q: string) {
  const query = q.trim();
  return useQuery({
    queryKey: [...BRANDS_KEY, status, query],
    retry: false,
    queryFn: async (): Promise<AdminBrand[]> => {
      const { data, error, response } = await webApi.client.GET('/api/v1/admin/catalog/brands', {
        params: { query: query === '' ? { status } : { status, q: query } },
      });
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
  });
}

export function useBrandMutations() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: BRANDS_KEY });
  const create = useMutation({
    mutationFn: async (body: { name: string }): Promise<AdminBrand> => {
      const { data, error, response } = await webApi.client.POST('/api/v1/admin/catalog/brands', {
        body,
      });
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: BrandPatch }): Promise<AdminBrand> => {
      const { data, error, response } = await webApi.client.PATCH(
        '/api/v1/admin/catalog/brands/{id}',
        { params: { path: { id } }, body },
      );
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
    onSuccess: refresh,
  });
  return { create, update };
}
