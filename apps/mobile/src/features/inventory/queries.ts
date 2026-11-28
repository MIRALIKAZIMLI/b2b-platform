// Depo stok sorguları — mobil (F3.11d). İşlem sonrası tüm stok sorguları yenilenir (liste, geçmiş).
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { StockItemFilter } from '@b2b/shared';
import { mobileApi } from '../../lib/session';
import {
  fetchMovements,
  fetchStockItems,
  fetchStockMode,
  fetchUnits,
  fetchWarehouses,
  type MovementInput,
  postMovement,
} from './api';

export const STOCK_KEY = ['inventory', 'stock'] as const;

export function useStockMode(businessId: string | undefined) {
  return useQuery({
    queryKey: ['inventory', 'stock-mode', businessId ?? null],
    enabled: businessId !== undefined,
    retry: false,
    queryFn: () => fetchStockMode(mobileApi().client, businessId ?? ''),
  });
}

export function useStockWarehouses(businessId: string | undefined) {
  return useQuery({
    queryKey: [...STOCK_KEY, 'warehouses', businessId ?? null],
    enabled: businessId !== undefined,
    retry: false,
    queryFn: () => fetchWarehouses(mobileApi().client, businessId ?? ''),
  });
}

export function useStockItems(
  businessId: string | undefined,
  warehouseId: string | undefined,
  q: string,
  filter: StockItemFilter,
) {
  return useInfiniteQuery({
    queryKey: [...STOCK_KEY, 'items', businessId ?? null, warehouseId ?? null, q.trim(), filter],
    enabled: businessId !== undefined && warehouseId !== undefined,
    retry: false,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      fetchStockItems(mobileApi().client, businessId ?? '', {
        warehouseId: warehouseId ?? '',
        q,
        filter,
        cursor: pageParam,
      }),
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
    queryFn: ({ pageParam }) =>
      fetchMovements(mobileApi().client, businessId ?? '', warehouseId, variantId, pageParam),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useRecordMovement(businessId: string | undefined, idempotencyKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: MovementInput) =>
      postMovement(mobileApi().client, businessId ?? '', input, idempotencyKey),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: STOCK_KEY }),
  });
}

/** Birim kısaltmaları (katalog; uzun süre değişmez). */
export function useUnits() {
  return useQuery({
    queryKey: ['catalog', 'units'],
    retry: false,
    staleTime: 60 * 60 * 1000,
    queryFn: () => fetchUnits(mobileApi().client),
  });
}
