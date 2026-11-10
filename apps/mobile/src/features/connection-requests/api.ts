// Bağlantı isteği istekleri (F2.12b; openapi `POST /api/v1/connection-requests`,
// `GET .../outgoing`). Saf: istemci parametreyle gelir (test edilebilir, expo yok).
import type { ApiClient, paths } from '@b2b/api-client';
import type { ConnectionRequestStatus } from '@b2b/shared';

type Outgoing = paths['/api/v1/connection-requests/outgoing']['get'];
export type OutgoingPage = Outgoing['responses']['200']['content']['application/json'];
export type OutgoingRequest = OutgoingPage['items'][number];
export type ConnectionRequestBody = NonNullable<
  paths['/api/v1/connection-requests']['post']['requestBody']
>['content']['application/json'];

/** API hata gövdesini taşır (`connectionRequestFailure(error.body)`). */
export class ConnectionRequestError extends Error {
  readonly body: unknown;

  constructor(body: unknown) {
    super(
      typeof body === 'object' && body !== null && 'code' in body && typeof body.code === 'string'
        ? body.code
        : 'INTERNAL_ERROR',
    );
    this.body = body;
  }
}

export async function postConnectionRequest(
  client: ApiClient,
  businessId: string,
  body: ConnectionRequestBody,
  idempotencyKey: string,
): Promise<void> {
  const { data, error } = await client.POST('/api/v1/connection-requests', {
    params: { header: { 'X-Business-Id': businessId, 'Idempotency-Key': idempotencyKey } },
    body,
  });
  if (data === undefined) throw new ConnectionRequestError(error);
}

export async function fetchOutgoing(
  client: ApiClient,
  businessId: string,
  status: ConnectionRequestStatus | undefined,
  cursor: string | undefined,
): Promise<OutgoingPage> {
  const { data, error } = await client.GET('/api/v1/connection-requests/outgoing', {
    params: {
      header: { 'X-Business-Id': businessId },
      query: {
        limit: 20,
        ...(status === undefined ? {} : { status }),
        ...(cursor === undefined ? {} : { cursor }),
      },
    },
  });
  if (data === undefined) throw new ConnectionRequestError(error);
  return data;
}

// ---- Gelen istekler, yanıt, geri çekme, engel (F2.13b; openapi F2.13a uçları) ----

type Incoming = paths['/api/v1/connection-requests/incoming']['get'];
export type IncomingPage = Incoming['responses']['200']['content']['application/json'];
export type BlockList =
  paths['/api/v1/blocks']['get']['responses']['200']['content']['application/json'];

export type RespondAction = 'accept' | 'reject' | 'withdraw';
/** Onay sayfası eylemi: yanıt, geri çekme, engel veya engel kaldırma. */
export type ConfirmAction = RespondAction | 'block' | 'unblock';

export async function fetchIncoming(
  client: ApiClient,
  businessId: string,
  cursor: string | undefined,
): Promise<IncomingPage> {
  const { data, error } = await client.GET('/api/v1/connection-requests/incoming', {
    params: {
      header: { 'X-Business-Id': businessId },
      query: { limit: 20, ...(cursor === undefined ? {} : { cursor }) },
    },
  });
  if (data === undefined) throw new ConnectionRequestError(error);
  return data;
}

export async function fetchBlocks(client: ApiClient, businessId: string): Promise<BlockList> {
  const { data, error } = await client.GET('/api/v1/blocks', {
    params: { header: { 'X-Business-Id': businessId } },
  });
  if (data === undefined) throw new ConnectionRequestError(error);
  return data;
}

/**
 * Onay sayfasının eylemi. Kabulde gövde `confirmDataSharing: true` (US-023 AC2). `id` istek
 * kimliği; engel ve engel kaldırmada toptancı kimliği.
 */
export async function runConfirmAction(
  client: ApiClient,
  businessId: string,
  action: ConfirmAction,
  id: string,
  idempotencyKey: string,
): Promise<void> {
  const header = { 'X-Business-Id': businessId, 'Idempotency-Key': idempotencyKey };
  if (action === 'unblock') {
    const { error, response } = await client.DELETE('/api/v1/blocks/{sellerId}', {
      params: { header: { 'X-Business-Id': businessId }, path: { sellerId: id } },
    });
    if (!response.ok) throw new ConnectionRequestError(error);
    return;
  }
  const result =
    action === 'block'
      ? await client.POST('/api/v1/blocks', { params: { header }, body: { sellerId: id } })
      : action === 'accept'
        ? await client.POST('/api/v1/connection-requests/{id}/accept', {
            params: { header, path: { id } },
            body: { confirmDataSharing: true },
          })
        : action === 'reject'
          ? await client.POST('/api/v1/connection-requests/{id}/reject', {
              params: { header, path: { id } },
            })
          : await client.POST('/api/v1/connection-requests/{id}/withdraw', {
              params: { header, path: { id } },
            });
  if (result.data === undefined) throw new ConnectionRequestError(result.error);
}
