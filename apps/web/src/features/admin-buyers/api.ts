'use client';
// Admin perakendeci uçları (F2.18a sözleşmesi; openapi `/api/v1/admin/buyers*`,
// `/api/v1/admin/businesses/{id}/status`). Yalnızca `packages/api-client` üzerinden.
import type { components } from '@b2b/api-client';
import type { BusinessStatusAction, BuyerAdminFilter, VoenRejectReason } from '@b2b/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { webApi } from '../../lib/session';
import { ApiError } from '../admin-sellers/api';

export type AdminBuyer = components['schemas']['AdminBuyer'];

const BUYERS_KEY = ['admin', 'buyers'] as const;
const PAGE_SIZE = 20;

function fail(error: unknown, status: number): never {
  throw new ApiError(error, status);
}

export function useBuyers(filter: BuyerAdminFilter) {
  return useInfiniteQuery({
    queryKey: [...BUYERS_KEY, 'list', filter],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const { data, error, response } = await webApi.client.GET('/api/v1/admin/buyers', {
        params: {
          query: {
            filter,
            limit: PAGE_SIZE,
            ...(pageParam === undefined ? {} : { cursor: pageParam }),
          },
        },
      });
      if (data === undefined) fail(error, response.status);
      return data;
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/** Kayıt penceresi (US-015 AC1): her açılışta güncel kayıt. */
export function useBuyer(id: string) {
  return useQuery({
    queryKey: [...BUYERS_KEY, 'one', id],
    // 404 (silinmiş/arşivli) yeniden denenmez.
    retry: (count, error) =>
      !(error instanceof ApiError && error.code === 'NOT_FOUND') && count < 2,
    queryFn: async () => {
      const { data, error, response } = await webApi.client.GET('/api/v1/admin/buyers/{id}', {
        params: { path: { id } },
      });
      if (data === undefined) fail(error, response.status);
      return data;
    },
  });
}

type VoenDecisionBody =
  { decision: 'verify' } | { decision: 'reject'; reason: VoenRejectReason; note?: string };

export function useVoenDecision(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: VoenDecisionBody) => {
      const { data, error, response } = await webApi.client.POST(
        '/api/v1/admin/buyers/{id}/verify',
        { params: { path: { id } }, body },
      );
      if (data === undefined) fail(error, response.status);
      return data;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: BUYERS_KEY });
    },
  });
}

export function useStatusAction(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: { action: BusinessStatusAction; reason: string }) => {
      const { data, error, response } = await webApi.client.POST(
        '/api/v1/admin/businesses/{id}/status',
        { params: { path: { id } }, body },
      );
      if (data === undefined) fail(error, response.status);
      return data;
    },
    // Silinen/arşivlenen kayıt artık 404: tekil sorgu atılır (yeniden denenip bekletmesin),
    // yalnız listeler yenilenir.
    onSuccess: (result) => {
      if (result.outcome !== 'updated') {
        queryClient.removeQueries({ queryKey: [...BUYERS_KEY, 'one', id] });
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: BUYERS_KEY });
    },
  });
}
