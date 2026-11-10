// Perakendecinin bağlı toptancıları ve bağlantı iptali — mobil (F2.15b; openapi `GET /api/v1/connections`,
// `POST /api/v1/connections/{id}/cancel`). Saf: istemci parametreyle gelir (test edilebilir, expo yok).
import type { ApiClient, paths } from '@b2b/api-client';
import type { ConnectionCancelBody, ConnectionStatus } from '@b2b/shared';
import { ConnectionRequestError } from '../connection-requests/api';

export type ConnectionPage =
  paths['/api/v1/connections']['get']['responses']['200']['content']['application/json'];
export type ConnectionItem = ConnectionPage['items'][number];

export async function fetchConnections(
  client: ApiClient,
  businessId: string,
  status: ConnectionStatus,
  cursor: string | undefined,
): Promise<ConnectionPage> {
  const { data, error } = await client.GET('/api/v1/connections', {
    params: {
      header: { 'X-Business-Id': businessId },
      query: { limit: 20, status, ...(cursor === undefined ? {} : { cursor }) },
    },
  });
  if (data === undefined) throw new ConnectionRequestError(error);
  return data;
}

export async function postCancel(
  client: ApiClient,
  businessId: string,
  id: string,
  body: ConnectionCancelBody,
  idempotencyKey: string,
): Promise<{ readonly cancelledOrders: number }> {
  const { data, error } = await client.POST('/api/v1/connections/{id}/cancel', {
    params: {
      header: { 'X-Business-Id': businessId, 'Idempotency-Key': idempotencyKey },
      path: { id },
    },
    body,
  });
  if (data === undefined) throw new ConnectionRequestError(error);
  return data;
}
