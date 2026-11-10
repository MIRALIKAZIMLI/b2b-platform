// F2.15b mobil toptancılarım ve bağlantı iptali (US-025 AC1, AC6).
import { createApiClient } from '@b2b/api-client';
import { describe, expect, it, vi } from 'vitest';
import { ConnectionRequestError } from '../../connection-requests/api';
import { mobileHref, mobileMenu, pushHref } from '../../shell/shell-state';
import { fetchConnections, postCancel } from '../api';

const BASE = 'http://mobile.test';
const BUSINESS = '0190a3b4-0000-7000-8000-0000000000aa';
const CONNECTION = '0190a3b4-0000-7000-8000-0000000000cc';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function clientWith(respond: () => Response) {
  const seen: Request[] = [];
  const fetch = vi.fn(async (request: Request) => {
    seen.push(request.clone());
    return Promise.resolve(respond());
  });
  return { client: createApiClient({ baseUrl: BASE, fetch }), seen };
}

describe('F2.15b mobil toptancılarım', () => {
  it('F2.15b-AC2 liste durum süzgeci ve işletme başlığıyla gider', async () => {
    const { client, seen } = clientWith(() => json(200, { items: [], nextCursor: null }));
    await fetchConnections(client, BUSINESS, 'cancelled', undefined);
    const url = new URL(seen[0]?.url ?? '');
    expect(url.pathname).toBe('/api/v1/connections');
    expect(url.searchParams.get('status')).toBe('cancelled');
    expect(seen[0]?.headers.get('X-Business-Id')).toBe(BUSINESS);
  });

  it('F2.15b-AC1 iptal gövdesi + idempotens; hata gövdesi ConnectionRequestError.body', async () => {
    const { client, seen } = clientWith(() => json(200, { cancelledOrders: 0 }));
    const body = { reason: 'other' as const, note: 'qeyd', confirm: true as const };
    await postCancel(client, BUSINESS, CONNECTION, body, 'cancel-0123456789abcdef');
    expect(seen[0]?.method).toBe('POST');
    expect(new URL(seen[0]?.url ?? '').pathname).toBe(`/api/v1/connections/${CONNECTION}/cancel`);
    expect(seen[0]?.headers.get('Idempotency-Key')).toBe('cancel-0123456789abcdef');
    expect(await seen[0]?.json()).toEqual(body);

    const failing = clientWith(() => json(404, { code: 'NOT_FOUND', message: 'x' }));
    const error = await postCancel(
      failing.client,
      BUSINESS,
      CONNECTION,
      body,
      'k'.repeat(16),
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConnectionRequestError);
    expect((error as ConnectionRequestError).body).toEqual({ code: 'NOT_FOUND', message: 'x' });
  });

  it('US-025-AC6 perakendeci menüsünde toptancılarım ekranı; iptal bildirimi oraya açılır', () => {
    const me = {
      activeBusiness: {
        id: BUSINESS,
        capability: 'buyer' as const,
        permissions: [{ code: 'connections.view', scope: 'all' }],
      },
    };
    const item = mobileMenu(me as never, 'buyer').find((entry) => entry.key === 'suppliers');
    expect(item).toBeDefined();
    expect(item === undefined ? undefined : mobileHref('buyer', item)).toBe('/suppliers');
    const data = { type: 'connection_cancelled', id: CONNECTION };
    expect(pushHref(data, 'buyer')).toBe('/suppliers');
    // Mobilde toptancı müşteri ekranı yok: uygulama yalnız açılır.
    expect(pushHref(data, 'seller')).toBeUndefined();
    expect(pushHref(data, undefined)).toBeUndefined();
  });
});
