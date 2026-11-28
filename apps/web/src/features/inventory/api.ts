'use client';
// Stok (F3.10, US-038): openapi `/api/v1/stock-mode`, `/api/v1/variants/{id}/availability`.
// Depo stok ekranı (F3.11b, US-039): `/api/v1/stock/warehouses`, `/api/v1/stock/items`,
// `/api/v1/stock/movements`, `/api/v1/stock-mode/quantity`.
// Yalnızca `packages/api-client`. İşaret değişince ürün önbelleğindeki varyant güncellenir (ürünün
// `updatedAt`'i değişmez: açık ürün formu sıfırlanmaz).
import type { components } from '@b2b/api-client';
import type { ManualStockMovementType, StockItemFilter } from '@b2b/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { webApi } from '../../lib/session';
import { ApiError } from '../admin-sellers/api';
import { type Product, PRODUCTS_KEY } from '../products/api';

export type StockMode = components['schemas']['StockMode'];

export type StockWarehouse = components['schemas']['StockWarehouse'];
export type StockItem = components['schemas']['StockItem'];
export type StockMovement = components['schemas']['StockMovement'];

export const STOCK_MODE_KEY = ['inventory', 'stock-mode'] as const;
export const STOCK_KEY = ['inventory', 'stock'] as const;

const header = (businessId: string | undefined) => ({ 'X-Business-Id': businessId ?? '' });

export function useStockMode(businessId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: [...STOCK_MODE_KEY, businessId ?? null],
    enabled: enabled && businessId !== undefined,
    retry: false,
    queryFn: async (): Promise<StockMode> => {
      const { data, error, response } = await webApi.client.GET('/api/v1/stock-mode', {
        params: { header: header(businessId) },
      });
      if (data === undefined) throw new ApiError(error, response.status);
      return data.stockMode;
    },
  });
}

export function useSetVariantAvailability(businessId: string | undefined, productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { variantId: string; isAvailable: boolean }) => {
      const { data, error, response } = await webApi.client.PUT(
        '/api/v1/variants/{id}/availability',
        {
          params: { header: header(businessId), path: { id: input.variantId } },
          body: { isAvailable: input.isAvailable },
        },
      );
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
    onSuccess: (result) => {
      queryClient.setQueryData<Product>(
        [...PRODUCTS_KEY, 'detail', businessId ?? null, productId],
        (current) =>
          current === undefined
            ? current
            : {
                ...current,
                variants: current.variants.map((variant) =>
                  variant.id === result.variantId
                    ? { ...variant, isAvailable: result.isAvailable }
                    : variant,
                ),
              },
      );
    },
  });
}

export function useStockWarehouses(businessId: string | undefined) {
  return useQuery({
    queryKey: [...STOCK_KEY, 'warehouses', businessId ?? null],
    enabled: businessId !== undefined,
    retry: false,
    queryFn: async (): Promise<StockWarehouse[]> => {
      const { data, error, response } = await webApi.client.GET('/api/v1/stock/warehouses', {
        params: { header: header(businessId) },
      });
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
  });
}

export interface StockItemsParams {
  readonly warehouseId: string | undefined;
  readonly q: string;
  readonly filter: StockItemFilter;
}

export function useStockItems(businessId: string | undefined, params: StockItemsParams) {
  const q = params.q.trim();
  return useInfiniteQuery({
    queryKey: [
      ...STOCK_KEY,
      'items',
      businessId ?? null,
      params.warehouseId ?? null,
      q,
      params.filter,
    ],
    enabled: businessId !== undefined && params.warehouseId !== undefined,
    retry: false,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const { data, error, response } = await webApi.client.GET('/api/v1/stock/items', {
        params: {
          header: header(businessId),
          query: {
            warehouseId: params.warehouseId ?? '',
            filter: params.filter,
            limit: 50,
            ...(q === '' ? {} : { q }),
            ...(pageParam === undefined ? {} : { cursor: pageParam }),
          },
        },
      });
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useStockMovements(
  businessId: string | undefined,
  warehouseId: string,
  variantId: string,
) {
  return useInfiniteQuery({
    queryKey: [...STOCK_KEY, 'movements', businessId ?? null, warehouseId, variantId],
    enabled: businessId !== undefined,
    retry: false,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const { data, error, response } = await webApi.client.GET('/api/v1/stock/movements', {
        params: {
          header: header(businessId),
          query: {
            warehouseId,
            variantId,
            limit: 20,
            ...(pageParam === undefined ? {} : { cursor: pageParam }),
          },
        },
      });
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export interface MovementInput {
  readonly warehouseId: string;
  readonly variantId: string;
  readonly type: ManualStockMovementType;
  /** Temel birimde (F3.11a K1). */
  readonly qty: string;
  readonly lotNo?: string;
  readonly expiryDate?: string;
  readonly note?: string;
}

/**
 * Mal girişi / sayım. `idempotencyKey` pencere açılışında bir kez üretilir: çift tıklama veya
 * yeniden deneme tek hareket yazar (F3.11a K8).
 */
export function useRecordMovement(businessId: string | undefined, idempotencyKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: MovementInput) => {
      const { data, error, response } = await webApi.client.POST('/api/v1/stock/movements', {
        params: { header: { ...header(businessId), 'Idempotency-Key': idempotencyKey } },
        body: input,
      });
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: STOCK_KEY });
    },
  });
}

/** Miktarlı stoğu aç (S5 = B ikinci adım); sayılmamış varyant varsa 409, onayla yeniden. */
export function useActivateQuantity(businessId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (confirmUncounted: boolean) => {
      const { data, error, response } = await webApi.client.POST('/api/v1/stock-mode/quantity', {
        params: { header: header(businessId) },
        body: confirmUncounted ? { confirmUncounted: true } : {},
      });
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: STOCK_MODE_KEY }),
        queryClient.invalidateQueries({ queryKey: ['seller', 'profile'] }),
      ]);
    },
  });
}
