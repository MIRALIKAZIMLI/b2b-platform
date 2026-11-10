'use client';
// Bağlantı isteği (F2.12b; openapi `POST /api/v1/connection-requests`,
// `GET /api/v1/connection-requests/outgoing`). Yalnız `packages/api-client`. Gönderme penceresi
// açılınca tek `Idempotency-Key` üretilir; yeniden denemede aynı kalır (çift istek yok).
import type { ApiClient, paths } from '@b2b/api-client';
import {
  type ConnectionRequestStatus,
  connectionRequestFailure,
  withPendingRelation,
} from '@b2b/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
    // Müfettiş 17 #59 L4: başarıda kart önbellekte yerinde "Gözləyir" olur (arama yeniden
    // çalışmaz); yalnız ilişkiyi değiştiren hatada dizin sunucudan okunur.
    onSuccess: (_data, { body }) => {
      queryClient.setQueriesData({ queryKey: ['directory'] }, (data: unknown) =>
        withPendingRelation(data, body.buyerId),
      );
    },
    onError: (error) => {
      const body = error instanceof ApiError ? { code: error.code } : undefined;
      if (connectionRequestFailure(body).relationChanged) {
        void queryClient.invalidateQueries({ queryKey: ['directory'] });
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: OUTGOING_KEY }),
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

// ---- Gelen istekler, yanıt, geri çekme, engel (F2.13b; openapi F2.13a uçları) ----

type Incoming = paths['/api/v1/connection-requests/incoming']['get'];
export type IncomingPage = Incoming['responses']['200']['content']['application/json'];
export type IncomingRequest = IncomingPage['items'][number];
export type BlockList =
  paths['/api/v1/blocks']['get']['responses']['200']['content']['application/json'];
export type BlockedSellerItem = BlockList['items'][number];

export const INCOMING_KEY = ['connection-requests', 'incoming'] as const;
export const BLOCKS_KEY = ['blocks'] as const;

export async function fetchIncoming(
  client: ApiClient,
  businessId: string,
  cursor: string | undefined,
): Promise<IncomingPage> {
  const { data, error, response } = await client.GET('/api/v1/connection-requests/incoming', {
    params: {
      header: { 'X-Business-Id': businessId },
      query: { limit: 20, ...(cursor === undefined ? {} : { cursor }) },
    },
  });
  if (data === undefined) throw new ApiError(error, response.status);
  return data;
}

export type RespondAction = 'accept' | 'reject' | 'withdraw';

/** Kabul (veri paylaşım onayıyla, US-023 AC2), red veya geri çekme; pencere başına tek anahtar. */
export async function respondToRequest(
  client: ApiClient,
  businessId: string,
  action: RespondAction,
  id: string,
  idempotencyKey: string,
): Promise<void> {
  const params = {
    header: { 'X-Business-Id': businessId, 'Idempotency-Key': idempotencyKey },
    path: { id },
  };
  const result =
    action === 'accept'
      ? await client.POST('/api/v1/connection-requests/{id}/accept', {
          params,
          body: { confirmDataSharing: true },
        })
      : action === 'reject'
        ? await client.POST('/api/v1/connection-requests/{id}/reject', { params })
        : await client.POST('/api/v1/connection-requests/{id}/withdraw', { params });
  if (result.data === undefined) throw new ApiError(result.error, result.response.status);
}

export async function fetchBlocks(client: ApiClient, businessId: string): Promise<BlockList> {
  const { data, error, response } = await client.GET('/api/v1/blocks', {
    params: { header: { 'X-Business-Id': businessId } },
  });
  if (data === undefined) throw new ApiError(error, response.status);
  return data;
}

export async function blockSeller(
  client: ApiClient,
  businessId: string,
  sellerId: string,
  idempotencyKey: string,
): Promise<void> {
  const { data, error, response } = await client.POST('/api/v1/blocks', {
    params: { header: { 'X-Business-Id': businessId, 'Idempotency-Key': idempotencyKey } },
    body: { sellerId },
  });
  if (data === undefined) throw new ApiError(error, response.status);
}

export async function unblockSeller(
  client: ApiClient,
  businessId: string,
  sellerId: string,
): Promise<void> {
  const { error, response } = await client.DELETE('/api/v1/blocks/{sellerId}', {
    params: { header: { 'X-Business-Id': businessId }, path: { sellerId } },
  });
  if (!response.ok) throw new ApiError(error, response.status);
}

export function useIncomingRequests(businessId: string | undefined) {
  return useInfiniteQuery({
    queryKey: [...INCOMING_KEY, businessId ?? null],
    enabled: businessId !== undefined,
    retry: false,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => fetchIncoming(webApi.client, businessId ?? '', pageParam),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useBlocks(businessId: string | undefined) {
  return useQuery({
    queryKey: [...BLOCKS_KEY, businessId ?? null],
    enabled: businessId !== undefined,
    retry: false,
    queryFn: () => fetchBlocks(webApi.client, businessId ?? ''),
  });
}

/** Pencere eylemi: yanıt, geri çekme, engel veya engel kaldırma. */
export type ConfirmAction = RespondAction | 'block' | 'unblock';

export function useConfirmAction(businessId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ action, id, key }: { action: ConfirmAction; id: string; key: string }) => {
      const business = businessId ?? '';
      if (action === 'block') return blockSeller(webApi.client, business, id, key);
      if (action === 'unblock') return unblockSeller(webApi.client, business, id);
      return respondToRequest(webApi.client, business, action, id, key);
    },
    // Başarıda ve hatada (istek artık bekleyen olmayabilir) listeler sunucudan okunur.
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: INCOMING_KEY }),
        queryClient.invalidateQueries({ queryKey: BLOCKS_KEY }),
        queryClient.invalidateQueries({ queryKey: OUTGOING_KEY }),
      ]),
  });
}
