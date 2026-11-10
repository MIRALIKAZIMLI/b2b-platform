import { createApiClient } from '@b2b/api-client';
import { connectionRequestFailure } from '@b2b/shared';
import { describe, expect, it, vi } from 'vitest';
import { mobileHref, mobileMenu } from '../../shell/shell-state';
import { ConnectionRequestError, fetchOutgoing, postConnectionRequest } from '../api';

const BASE = 'http://mobile.test';
const BUSINESS = '0190a3b4-0000-7000-8000-0000000000aa';
const BUYER = '0190a3b4-0000-7000-8000-0000000000bb';

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

describe('F2.12b mobil bağlantı isteği', () => {
  it('F2.12b-AC1 istek gövdesi, işletme ve idempotens başlığıyla gider', async () => {
    const { client, seen } = clientWith(() => json(201, { id: 'r-1', status: 'pending' }));
    await postConnectionRequest(
      client,
      BUSINESS,
      { buyerId: BUYER, proposedPaymentTermDays: 15 },
      'conn-0123456789abcdef0123456789abcdef',
    );
    const request = seen[0];
    expect(new URL(request?.url ?? '').pathname).toBe('/api/v1/connection-requests');
    expect(request?.headers.get('X-Business-Id')).toBe(BUSINESS);
    expect(request?.headers.get('Idempotency-Key')).toBe('conn-0123456789abcdef0123456789abcdef');
    expect(await request?.json()).toEqual({ buyerId: BUYER, proposedPaymentTermDays: 15 });
  });

  it('F2.12b-AC2 yeniden deneme aynı anahtarı taşır', async () => {
    let calls = 0;
    const { client, seen } = clientWith(() => {
      calls += 1;
      return calls === 1 ? json(503, { code: 'INTERNAL_ERROR' }) : json(201, { id: 'r-1' });
    });
    const key = 'conn-ffffffffffffffffffffffffffffffff';
    await expect(postConnectionRequest(client, BUSINESS, { buyerId: BUYER }, key)).rejects.toThrow(
      ConnectionRequestError,
    );
    await postConnectionRequest(client, BUSINESS, { buyerId: BUYER }, key);
    expect(seen.map((r) => r.headers.get('Idempotency-Key'))).toEqual([key, key]);
  });

  it('F2.12b-AC5 429 gövdesi hataya taşınır; kalan süre saat + dakika', async () => {
    const { client } = clientWith(() =>
      json(429, { code: 'CONNECTION_DAILY_QUOTA_EXCEEDED', details: { retryAfter: 5400 } }),
    );
    const error: unknown = await postConnectionRequest(
      client,
      BUSINESS,
      { buyerId: BUYER },
      'conn-1',
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConnectionRequestError);
    const failure = connectionRequestFailure((error as ConnectionRequestError).body);
    expect(failure.wait).toEqual({ hours: 1, minutes: 30 });
  });

  it('F2.12b-AC8 gönderilenler: durum süzgeci sorguda', async () => {
    const { client, seen } = clientWith(() => json(200, { items: [], nextCursor: null }));
    expect(await fetchOutgoing(client, BUSINESS, 'rejected', undefined)).toEqual({
      items: [],
      nextCursor: null,
    });
    const url = new URL(seen[0]?.url ?? '');
    expect(url.pathname).toBe('/api/v1/connection-requests/outgoing');
    expect(url.searchParams.get('status')).toBe('rejected');
    expect(url.searchParams.has('cursor')).toBe(false);
  });

  it('F2.12b-AC7 "İstekler" yalnız connections.request.send ile ve mobil ekrana gider', () => {
    const rep = {
      activeBusiness: {
        capability: 'seller' as const,
        permissions: [{ code: 'connections.request.send', scope: 'assigned' as const }],
      },
    };
    const item = mobileMenu(rep, 'seller').find((entry) => entry.key === 'requests');
    expect(item === undefined ? undefined : mobileHref('seller', item)).toBe('/requests');
    const none = mobileMenu(
      { activeBusiness: { capability: 'seller', permissions: [] } },
      'seller',
    );
    expect(none.some((entry) => entry.key === 'requests')).toBe(false);
  });
});
