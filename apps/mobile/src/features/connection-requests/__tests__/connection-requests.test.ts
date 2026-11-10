import { createApiClient } from '@b2b/api-client';
import { connectionRequestFailure, createIdempotencyKey } from '@b2b/shared';
import { describe, expect, it, vi } from 'vitest';
import { mobileHref, mobileMenu, pushHref } from '../../shell/shell-state';
import {
  ConnectionRequestError,
  fetchBlocks,
  fetchIncoming,
  fetchOutgoing,
  postConnectionRequest,
  runConfirmAction,
} from '../api';

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

const REQUEST = '0190a3b4-0000-7000-8000-0000000000cc';
const SELLER = '0190a3b4-0000-7000-8000-0000000000dd';
const KEY = createIdempotencyKey('resp');

describe('F2.13b mobil gelen istekler, yanıt ve engel', () => {
  it('F2.13b-AC1 gelen liste: işletme başlığı ve imleç', async () => {
    const { client, seen } = clientWith(() => json(200, { items: [], nextCursor: null }));
    await fetchIncoming(client, BUSINESS, REQUEST);
    const url = new URL(seen[0]?.url ?? '');
    expect(url.pathname).toBe('/api/v1/connection-requests/incoming');
    expect(url.searchParams.get('cursor')).toBe(REQUEST);
    expect(seen[0]?.headers.get('X-Business-Id')).toBe(BUSINESS);
  });

  it('F2.13b-AC2 kabul gövdesi confirmDataSharing: true ve idempotens anahtarı', async () => {
    const { client, seen } = clientWith(() => json(200, { id: 'c-1', status: 'active' }));
    await runConfirmAction(client, BUSINESS, 'accept', REQUEST, KEY);
    expect(new URL(seen[0]?.url ?? '').pathname).toBe(
      `/api/v1/connection-requests/${REQUEST}/accept`,
    );
    expect(seen[0]?.headers.get('Idempotency-Key')).toBe(KEY);
    expect(await seen[0]?.json()).toEqual({ confirmDataSharing: true });
  });

  it('F2.13b-AC3 engel: toptancı kimliği gövdede; red süresi dolmuşsa 409 gövdesi taşınır', async () => {
    const blocked = clientWith(() => json(201, { sellerId: SELLER }));
    await runConfirmAction(blocked.client, BUSINESS, 'block', SELLER, KEY);
    expect(new URL(blocked.seen[0]?.url ?? '').pathname).toBe('/api/v1/blocks');
    expect(await blocked.seen[0]?.json()).toEqual({ sellerId: SELLER });
    const expired = clientWith(() => json(409, { code: 'CONNECTION_REQUEST_EXPIRED' }));
    const error: unknown = await runConfirmAction(
      expired.client,
      BUSINESS,
      'reject',
      REQUEST,
      KEY,
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConnectionRequestError);
    expect((error as ConnectionRequestError).message).toBe('CONNECTION_REQUEST_EXPIRED');
  });

  it('F2.13b-AC4 bloklananlar listesi ve "Bloku götür" (DELETE 204)', async () => {
    const list = clientWith(() => json(200, { items: [] }));
    expect(await fetchBlocks(list.client, BUSINESS)).toEqual({ items: [] });
    const removed = clientWith(() => new Response(null, { status: 204 }));
    await runConfirmAction(removed.client, BUSINESS, 'unblock', SELLER, KEY);
    expect(removed.seen[0]?.method).toBe('DELETE');
    expect(new URL(removed.seen[0]?.url ?? '').pathname).toBe(`/api/v1/blocks/${SELLER}`);
  });

  it('F2.13b-AC6 geri çekme: başkasının isteği 404', async () => {
    const { client, seen } = clientWith(() => json(404, { code: 'NOT_FOUND' }));
    await expect(runConfirmAction(client, BUSINESS, 'withdraw', REQUEST, KEY)).rejects.toThrow(
      'NOT_FOUND',
    );
    expect(new URL(seen[0]?.url ?? '').pathname).toBe(
      `/api/v1/connection-requests/${REQUEST}/withdraw`,
    );
  });

  it('F2.13b-AC5 "Gələn sorğular" connections.view ile mobil ekrana gider', () => {
    const buyer = {
      activeBusiness: {
        capability: 'buyer' as const,
        permissions: [{ code: 'connections.view', scope: 'all' as const }],
      },
    };
    const item = mobileMenu(buyer, 'buyer').find((entry) => entry.key === 'incoming_requests');
    expect(item === undefined ? undefined : mobileHref('buyer', item)).toBe('/incoming-requests');
  });

  it('F2.13b-AC7 push dokunuşu: türe ve seçili alana göre ekran', () => {
    expect(pushHref({ type: 'connection_request', id: REQUEST }, 'buyer')).toBe(
      '/incoming-requests',
    );
    expect(pushHref({ type: 'connection_accepted', id: REQUEST }, 'seller')).toBe('/requests');
    expect(pushHref({ type: 'connection_rejected', id: REQUEST }, 'seller')).toBe('/requests');
    // Alan uyuşmazsa ya da tür bilinmiyorsa ekran açılmaz.
    expect(pushHref({ type: 'connection_request', id: REQUEST }, 'seller')).toBeUndefined();
    expect(pushHref({ type: 'team_invitation' }, 'buyer')).toBeUndefined();
    expect(pushHref(undefined, undefined)).toBeUndefined();
  });
});
