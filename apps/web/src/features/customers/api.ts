'use client';
// Toptancı müşterileri ve bağlantı koşulları (F2.14b; openapi `GET /api/v1/connections`,
// `GET /api/v1/connections/sales-reps`, `PATCH /api/v1/connections/{id}/terms`). Yalnız
// `packages/api-client`. PATCH idempotency anahtarı istemez (aynı gövde aynı sonucu verir).
import type { ApiClient, paths } from '@b2b/api-client';
import type { ConnectionStatus, TermsFormBody } from '@b2b/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { webApi } from '../../lib/session';
import { ApiError } from '../admin-sellers/api';

type List = paths['/api/v1/connections']['get'];
export type ConnectionPage = List['responses']['200']['content']['application/json'];
export type ConnectionItem = ConnectionPage['items'][number];
export type SalesRepList =
  paths['/api/v1/connections/sales-reps']['get']['responses']['200']['content']['application/json'];

export const CONNECTIONS_KEY = ['connections'] as const;
export const SALES_REPS_KEY = ['connections', 'sales-reps'] as const;

export async function fetchConnections(
  client: ApiClient,
  businessId: string,
  status: ConnectionStatus,
  cursor: string | undefined,
): Promise<ConnectionPage> {
  const { data, error, response } = await client.GET('/api/v1/connections', {
    params: {
      header: { 'X-Business-Id': businessId },
      query: { limit: 20, status, ...(cursor === undefined ? {} : { cursor }) },
    },
  });
  if (data === undefined) throw new ApiError(error, response.status);
  return data;
}

export async function fetchSalesReps(client: ApiClient, businessId: string): Promise<SalesRepList> {
  const { data, error, response } = await client.GET('/api/v1/connections/sales-reps', {
    params: { header: { 'X-Business-Id': businessId } },
  });
  if (data === undefined) throw new ApiError(error, response.status);
  return data;
}

export async function patchTerms(
  client: ApiClient,
  businessId: string,
  id: string,
  body: TermsFormBody,
): Promise<ConnectionItem> {
  const { data, error, response } = await client.PATCH('/api/v1/connections/{id}/terms', {
    params: { header: { 'X-Business-Id': businessId }, path: { id } },
    body,
  });
  if (data === undefined) throw new ApiError(error, response.status);
  return data;
}

export function useConnections(businessId: string | undefined, status: ConnectionStatus) {
  return useInfiniteQuery({
    queryKey: [...CONNECTIONS_KEY, 'list', businessId ?? null, status],
    enabled: businessId !== undefined,
    retry: false,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      fetchConnections(webApi.client, businessId ?? '', status, pageParam),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/** Temsilci adları (liste + pencere); yalnız koşul yönetme izni olan çağırır. */
export function useSalesReps(businessId: string | undefined) {
  return useQuery({
    queryKey: [...SALES_REPS_KEY, businessId ?? null],
    enabled: businessId !== undefined,
    retry: false,
    queryFn: () => fetchSalesReps(webApi.client, businessId ?? ''),
  });
}

export function useUpdateTerms(businessId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: TermsFormBody }) =>
      patchTerms(webApi.client, businessId ?? '', id, body),
    onSettled: () => queryClient.invalidateQueries({ queryKey: [...CONNECTIONS_KEY, 'list'] }),
  });
}
