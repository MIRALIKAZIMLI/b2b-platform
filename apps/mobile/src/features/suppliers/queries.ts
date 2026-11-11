// Toptancılarım sorguları (F2.15b). İptal başarıda da hatada da listeyi sunucudan yeniler.
import type { ConnectionCancelBody, ConnectionStatus } from '@b2b/shared';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mobileApi } from '../../lib/session';
import { fetchConnections, postCancel } from './api';

export const SUPPLIERS_KEY = ['connections', 'list'] as const;

export function useSuppliers(businessId: string | undefined, status: ConnectionStatus) {
  return useInfiniteQuery({
    queryKey: [...SUPPLIERS_KEY, businessId ?? null, status],
    enabled: businessId !== undefined,
    retry: false,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      fetchConnections(mobileApi().client, businessId ?? '', status, pageParam),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useCancelConnection(businessId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body, key }: { id: string; body: ConnectionCancelBody; key: string }) =>
      postCancel(mobileApi().client, businessId ?? '', id, body, key),
    onSettled: () => queryClient.invalidateQueries({ queryKey: SUPPLIERS_KEY }),
  });
}
