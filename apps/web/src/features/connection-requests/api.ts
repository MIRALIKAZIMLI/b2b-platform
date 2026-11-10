'use client';
// Bağlantı isteği (F2.12b; openapi `POST /api/v1/connection-requests`,
// `GET /api/v1/connection-requests/outgoing`). Yalnız `packages/api-client`. Gönderme penceresi
// açılınca tek `Idempotency-Key` üretilir; yeniden denemede aynı kalır (çift istek yok).
import type { ApiClient, paths } from '@b2b/api-client';
import type { ConnectionRequestStatus } from '@b2b/shared';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { webApi } from '../../lib/session';
import { ApiError } from '../admin-sellers/api';

type Outgoing = paths['/api/v1/connection-requests/outgoing']['get'];
export type ConnectionRequestBody = NonNullable<
  paths['/api/v1/connection-requests']['post']['requestBody']
>['content']['application/json'];
export type OutgoingPage = Outgoing['responses']['200']['content']['application/json'];
export type OutgoingRequest = OutgoingPage['items'][number];

export const OUTGOING_KEY = ['connection-requests', 'outgoing'] as const;

/** İstek gönderir; başarısızlıkta API gövdesiyle `ApiError` (kod + `details`). */
export async function postConnectionRequest(
  client: ApiClient,
  businessId: string,
  body: ConnectionRequestBody,
  idempotencyKey: string,
): Promise<void> {
  const { data, error, response } = await client.POST('/api/v1/connection-requests', {
    params: { header: { 'X-Business-Id': businessId, 'Idempotency-Key': idempotencyKey } },
    body,
  });
  if (data === undefined) throw new ApiError(error, response.status);
}

export async function fetchOutgoing(
  client: ApiClient,
  businessId: string,
  status: ConnectionRequestStatus | undefined,
  cursor: string | undefined,
): Promise<OutgoingPage> {
  const { data, error, response } = await client.GET('/api/v1/connection-requests/outgoing', {
    params: {
      header: { 'X-Business-Id': businessId },
      query: {
        limit: 20,
        ...(status === undefined ? {} : { status }),
        ...(cursor === undefined ? {} : { cursor }),
      },
    },
  });
  if (data === undefined) throw new ApiError(error, response.status);
  return data;
}

export function useSendConnectionRequest(businessId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ body, key }: { body: ConnectionRequestBody; key: string }) =>
      postConnectionRequest(webApi.client, businessId ?? '', body, key),
    // Başarıda ve ilişkiyi değiştiren hatada kart durumu sunucudan yeniden okunur.
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['directory'] }),
        queryClient.invalidateQueries({ queryKey: OUTGOING_KEY }),
      ]),
  });
}

export function useOutgoingRequests(
  businessId: string | undefined,
  status: ConnectionRequestStatus | undefined,
) {
  return useInfiniteQuery({
    queryKey: [...OUTGOING_KEY, businessId ?? null, status ?? 'all'],
    enabled: businessId !== undefined,
    retry: false,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => fetchOutgoing(webApi.client, businessId ?? '', status, pageParam),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}
