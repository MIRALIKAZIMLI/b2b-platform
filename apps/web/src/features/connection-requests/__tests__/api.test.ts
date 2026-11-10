import { createApiClient } from '@b2b/api-client';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../admin-sellers/api';
import { fetchOutgoing, postConnectionRequest } from '../api';

const BASE = 'http://web.test';
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

const created = {
  id: '0190a3b4-0000-7000-8000-0000000000cc',
  sellerId: BUSINESS,
  buyerId: BUYER,
  status: 'pending',
  message: 'Salam',
  proposedPaymentTermDays: 30,
  expiresAt: '2026-11-24T00:00:00.000Z',
  createdAt: '2026-11-10T00:00:00.000Z',
};

describe('F2.12b web bağlantı isteği', () => {
  it('F2.12b-AC1 istek gövdesi, işletme ve idempotens başlığıyla gider', async () => {
    const { client, seen } = clientWith(() => json(201, created));
    await postConnectionRequest(
      client,
      BUSINESS,
      { buyerId: BUYER, message: 'Salam', proposedPaymentTermDays: 30 },
      'conn-0123456789abcdef0123456789abcdef',
    );
    const request = seen[0];
    expect(request?.method).toBe('POST');
    expect(new URL(request?.url ?? '').pathname).toBe('/api/v1/connection-requests');
    expect(request?.headers.get('X-Business-Id')).toBe(BUSINESS);
    expect(request?.headers.get('Idempotency-Key')).toBe('conn-0123456789abcdef0123456789abcdef');
    expect(await request?.json()).toEqual({
      buyerId: BUYER,
      message: 'Salam',
      proposedPaymentTermDays: 30,
    });
  });

  it('F2.12b-AC2 aynı pencerede yeniden deneme aynı anahtarı taşır', async () => {
    let calls = 0;
    const { client, seen } = clientWith(() => {
      calls += 1;
      return calls === 1 ? json(500, { code: 'INTERNAL_ERROR' }) : json(201, created);
    });
    const key = 'conn-ffffffffffffffffffffffffffffffff';
    await expect(
      postConnectionRequest(client, BUSINESS, { buyerId: BUYER }, key),
    ).rejects.toThrow();
    await postConnectionRequest(client, BUSINESS, { buyerId: BUYER }, key);
    expect(seen.map((r) => r.headers.get('Idempotency-Key'))).toEqual([key, key]);
  });

  it('F2.12b-AC4 409 bekleme süresi: kod ve bitiş tarihi hataya taşınır', async () => {
    const until = '2026-12-10T08:00:00.000Z';
    const { client } = clientWith(() =>
      json(409, { code: 'CONNECTION_COOLDOWN_ACTIVE', details: { cooldownUntil: until } }),
    );
    const error: unknown = await postConnectionRequest(
      client,
      BUSINESS,
      { buyerId: BUYER },
      'conn-1',
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      code: 'CONNECTION_COOLDOWN_ACTIVE',
      details: { cooldownUntil: until },
    });
  });

  it('F2.12b-AC8 gönderilenler: durum süzgeci ve imleç sorguda; sayfa döner', async () => {
    const page = { items: [{ ...created, buyerName: null }], nextCursor: null };
    const { client, seen } = clientWith(() => json(200, page));
    expect(await fetchOutgoing(client, BUSINESS, 'pending', created.id)).toEqual(page);
    const url = new URL(seen[0]?.url ?? '');
    expect(url.pathname).toBe('/api/v1/connection-requests/outgoing');
    expect(url.searchParams.get('status')).toBe('pending');
    expect(url.searchParams.get('cursor')).toBe(created.id);
    expect(url.searchParams.get('limit')).toBe('20');
    await fetchOutgoing(client, BUSINESS, undefined, undefined);
    expect(new URL(seen[1]?.url ?? '').searchParams.has('status')).toBe(false);
  });
});
