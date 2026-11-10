import { createApiClient } from '@b2b/api-client';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../admin-sellers/api';
import { fetchConnections, fetchSalesReps, patchTerms, postCancel } from '../api';

const BASE = 'http://web.test';
const BUSINESS = '0190a3b4-0000-7000-8000-0000000000aa';
const CONNECTION = '0190a3b4-0000-7000-8000-0000000000cc';
const REP = '0190a3b4-0000-7000-8000-0000000000dd';

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

const connection = {
  id: CONNECTION,
  sellerId: BUSINESS,
  buyerId: '0190a3b4-0000-7000-8000-0000000000bb',
  counterpartyName: 'Market',
  status: 'active',
  termsAssigned: true,
  terms: { creditLimit: '1500.00', paymentTermDays: 30, salesRepMembershipId: REP },
  startedAt: '2026-11-10T08:00:00.000Z',
  endedAt: null,
  endedBySide: null,
};

describe('F2.14b web müşteriler ve koşullar', () => {
  it('F2.14b-AC1 liste: durum, sayfa boyu, imleç ve işletme başlığı', async () => {
    const { client, seen } = clientWith(() => json(200, { items: [connection], nextCursor: null }));
    const page = await fetchConnections(client, BUSINESS, 'active', CONNECTION);
    expect(page.items).toHaveLength(1);
    const url = new URL(seen[0]?.url ?? '');
    expect(url.pathname).toBe('/api/v1/connections');
    expect(url.searchParams.get('status')).toBe('active');
    expect(url.searchParams.get('limit')).toBe('20');
    expect(url.searchParams.get('cursor')).toBe(CONNECTION);
    expect(seen[0]?.headers.get('X-Business-Id')).toBe(BUSINESS);
  });

  it('F2.14b-AC2 koşul kaydı PATCH gövdesiyle, idempotens başlığı olmadan gider', async () => {
    const { client, seen } = clientWith(() => json(200, connection));
    const body = { creditLimit: '1500.00', paymentTermDays: 30, salesRepMembershipId: REP };
    await patchTerms(client, BUSINESS, CONNECTION, body);
    const request = seen[0];
    expect(request?.method).toBe('PATCH');
    expect(new URL(request?.url ?? '').pathname).toBe(`/api/v1/connections/${CONNECTION}/terms`);
    expect(request?.headers.get('Idempotency-Key')).toBeNull();
    expect(await request?.json()).toEqual(body);
  });

  it('F2.14b-AC4 hata gövdesi ApiError olur (kod + ayrıntı); temsilci listesi okunur', async () => {
    const failing = clientWith(() =>
      json(422, {
        code: 'VALIDATION_FAILED',
        message: 'x',
        details: { salesRepMembershipId: ['invalid_sales_rep'] },
      }),
    );
    const error = await patchTerms(failing.client, BUSINESS, CONNECTION, {
      creditLimit: null,
      paymentTermDays: 0,
      salesRepMembershipId: REP,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('VALIDATION_FAILED');

    const reps = clientWith(() => json(200, { items: [{ membershipId: REP, fullName: 'Aynur' }] }));
    expect((await fetchSalesReps(reps.client, BUSINESS)).items[0]?.fullName).toBe('Aynur');
    expect(new URL(reps.seen[0]?.url ?? '').pathname).toBe('/api/v1/connections/sales-reps');
  });

  it('F2.15b-AC1 iptal: POST gövdesi, idempotens ve işletme başlığı; 409 ApiError olur', async () => {
    const { client, seen } = clientWith(() => json(200, { cancelledOrders: 0 }));
    const body = { reason: 'payment_issue' as const, confirm: true as const };
    expect(await postCancel(client, BUSINESS, CONNECTION, body, 'cancel-0123456789abcdef')).toEqual(
      {
        cancelledOrders: 0,
      },
    );
    const request = seen[0];
    expect(request?.method).toBe('POST');
    expect(new URL(request?.url ?? '').pathname).toBe(`/api/v1/connections/${CONNECTION}/cancel`);
    expect(request?.headers.get('Idempotency-Key')).toBe('cancel-0123456789abcdef');
    expect(request?.headers.get('X-Business-Id')).toBe(BUSINESS);
    expect(await request?.json()).toEqual(body);

    const failing = clientWith(() => json(409, { code: 'INVALID_STATE_TRANSITION', message: 'x' }));
    const error = await postCancel(
      failing.client,
      BUSINESS,
      CONNECTION,
      body,
      'k'.repeat(16),
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('INVALID_STATE_TRANSITION');
  });
});
