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
