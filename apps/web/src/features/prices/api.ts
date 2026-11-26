'use client';
// Toptancı fiyat ekranları (F3.6b, US-034): openapi `/api/v1/price-lists*`, `/api/v1/prices/explain`.
// Yalnız `packages/api-client`. POST tek `Idempotency-Key` ile (pencere açılınca üretilir).
import type { components, paths } from '@b2b/api-client';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { webApi } from '../../lib/session';
import { ApiError } from '../admin-sellers/api';

export type PriceList = components['schemas']['PriceList'];
export type PriceListItem = components['schemas']['PriceListItem'];
export type PriceExplanation = components['schemas']['PriceExplanation'];
export type PriceListInput = components['schemas']['PriceListInput'];
export type PriceListPatch = components['schemas']['PriceListUpdate'];
export type PriceItemsPut =
  paths['/api/v1/price-lists/{id}/items']['put']['requestBody']['content']['application/json'];

export const PRICE_LISTS_KEY = ['price-lists'] as const;

const header = (businessId: string | undefined) => ({ 'X-Business-Id': businessId ?? '' });

export function usePriceLists(businessId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: [...PRICE_LISTS_KEY, 'list', businessId ?? null],
    enabled: enabled && businessId !== undefined,
    retry: false,
    queryFn: async (): Promise<PriceList[]> => {
      const { data, error, response } = await webApi.client.GET('/api/v1/price-lists', {
        params: { header: header(businessId) },
      });
      if (data === undefined) throw new ApiError(error, response.status);
      return data.items;
    },
  });
}

export function usePriceListMutations(businessId: string | undefined) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: PRICE_LISTS_KEY });
  const create = useMutation({
    mutationFn: async ({
      body,
      key,
    }: {
      body: PriceListInput;
      key: string;
    }): Promise<PriceList> => {
      const { data, error, response } = await webApi.client.POST('/api/v1/price-lists', {
        params: { header: { ...header(businessId), 'Idempotency-Key': key } },
        body,
      });
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
    onSettled: refresh,
  });
  const update = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: PriceListPatch }): Promise<PriceList> => {
      const { data, error, response } = await webApi.client.PATCH('/api/v1/price-lists/{id}', {
        params: { header: header(businessId), path: { id } },
        body,
      });
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
    onSettled: refresh,
  });
  return { create, update };
}

/** Ürünün ambalaj seviyelerinin bu listedeki fiyatları (F3.6b K1: `packagingId` süzgeci). */
export function useListPrices(
  businessId: string | undefined,
  listId: string | undefined,
  packagingIds: readonly string[],
) {
  return useQuery({
    queryKey: [...PRICE_LISTS_KEY, 'items', businessId ?? null, listId ?? null, packagingIds],
    enabled: businessId !== undefined && listId !== undefined && packagingIds.length > 0,
    retry: false,
    queryFn: async (): Promise<PriceListItem[]> => {
      const { data, error, response } = await webApi.client.GET('/api/v1/price-lists/{id}/items', {
        params: {
          header: header(businessId),
          path: { id: listId ?? '' },
          query: { limit: 100, packagingId: [...packagingIds] },
        },
      });
      if (data === undefined) throw new ApiError(error, response.status);
      return data.items;
    },
  });
}

export function useSetPrices(businessId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      listId,
      body,
    }: {
      listId: string;
      body: PriceItemsPut;
    }): Promise<{ count: number; validFrom: string }> => {
      const { data, error, response } = await webApi.client.PUT('/api/v1/price-lists/{id}/items', {
        params: { header: header(businessId), path: { id: listId } },
        body,
      });
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: PRICE_LISTS_KEY }),
  });
}

/** US-034 AC5: seçilen müşteri için her ambalajın fiyat kaynağı. */
export function usePriceExplanations(
  businessId: string | undefined,
  buyerId: string | undefined,
  packagingIds: readonly string[],
) {
  return useQueries({
    queries: packagingIds.map((packagingId) => ({
      queryKey: [...PRICE_LISTS_KEY, 'explain', businessId ?? null, buyerId ?? null, packagingId],
      enabled: businessId !== undefined && buyerId !== undefined,
      retry: false,
      queryFn: async (): Promise<PriceExplanation> => {
        const { data, error, response } = await webApi.client.GET('/api/v1/prices/explain', {
          params: { header: header(businessId), query: { buyerId: buyerId ?? '', packagingId } },
        });
        if (data === undefined) throw new ApiError(error, response.status);
        return data;
      },
    })),
  });
}
