import { createApiClient } from '@b2b/api-client';
import type { BuyerRegisterBody } from '@b2b/shared';
import { describe, expect, it, vi } from 'vitest';
import { createLoginFlow } from '../../auth/login-flow';
import { activityOptions, canManageBusiness, filterOptions, regionOptions } from '../options';

const BASE = 'http://mobile.test';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const body: BuyerRegisterBody = {
  fullName: 'Leyla Əliyeva',
  legalName: 'Leyla Market',
  activityTypeId: '0190a3b4-0000-7000-8000-000000000001',
  regionId: '0190a3b4-0000-7000-8000-000000000002',
  consentVersion: 'v1',
  preferredLanguage: 'az',
};

function flowWith(respond: (request: Request) => Response) {
  const seen: Request[] = [];
  const fetch = vi.fn(async (request: Request) => {
    seen.push(request.clone());
    return Promise.resolve(respond(request));
  });
  const flow = createLoginFlow({
    client: createApiClient({ baseUrl: BASE, fetch }),
    device: { type: 'android' },
  });
  return { flow, seen };
}

describe('F2.3b mobil perakendeci kaydı', () => {
  it('US-005-AC1 kayıt anahtarı ve idempotens anahtarıyla gönderilir; oturum anahtarları döner', async () => {
    const { flow, seen } = flowWith(() =>
      json(201, {
        businessId: 'b-1',
        profileCompleteness: 40,
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
        expiresIn: 900,
      }),
    );
    expect(await flow.registerBuyer('pending-1', body, 'reg-0123456789abcdef')).toEqual({
      kind: 'signed_in',
      tokens: { accessToken: 'access-1', refreshToken: 'refresh-1' },
    });
    const request = seen[0];
    expect(new URL(request?.url ?? '').pathname).toBe('/api/v1/buyers/register');
    expect(request?.headers.get('Authorization')).toBe('Bearer pending-1');
    expect(request?.headers.get('Idempotency-Key')).toBe('reg-0123456789abcdef');
    expect(await request?.json()).toEqual(body);
  });

  it('F2.3b aynı anahtarla tekrar (oturumsuz 201) → kayıt var, girişe yönlendirilir', async () => {
    const { flow } = flowWith(() => json(201, { businessId: 'b-1', profileCompleteness: 40 }));
    expect(await flow.registerBuyer('pending-1', body, 'reg-0123456789abcdef')).toEqual({
      kind: 'registered',
    });
  });

  it('US-005-AC4 409 PHONE_ALREADY_REGISTERED → giriş akışı', async () => {
    const { flow } = flowWith(() => json(409, { code: 'PHONE_ALREADY_REGISTERED' }));
    expect(await flow.registerBuyer('pending-1', body, 'reg-0123456789abcdef')).toEqual({
      kind: 'failed',
      failure: { kind: 'already_registered' },
    });
  });

  it('US-005-AC3 422 alan hatası alana düşer', async () => {
    const { flow } = flowWith(() =>
      json(422, { code: 'VALIDATION_FAILED', details: { regionId: ['not_found'] } }),
    );
    expect(await flow.registerBuyer('pending-1', body, 'reg-0123456789abcdef')).toEqual({
      kind: 'failed',
      failure: { kind: 'fields', fields: { regionId: 'not_found' } },
    });
  });

  it('F2.3b bölgeler "şehir · rayon", faaliyet türleri arayüz dilinde; arama büyük/küçük harf duyarsız', () => {
    const regions = regionOptions(
      [
        {
          id: 'c',
          countryCode: 'AZ',
          parentId: null,
          type: 'city',
          name: { az: 'Bakı', ru: 'Баку' },
        },
        { id: 'd', countryCode: 'AZ', parentId: 'c', type: 'district', name: { az: 'Yasamal' } },
      ],
      'ru',
    );
    expect(regions).toEqual([
      { id: 'c', label: 'Баку' },
      { id: 'd', label: 'Баку · Yasamal' },
    ]);
    expect(
      activityOptions([{ id: 'a', name: { az: 'Ərzaq', tr: 'Gıda' }, sortOrder: 1 }], 'tr'),
    ).toEqual([{ id: 'a', label: 'Gıda' }]);
    expect(filterOptions(regions, '  yasa ')).toEqual([{ id: 'd', label: 'Баку · Yasamal' }]);
  });

  it('US-005-AC2 profil kartı yalnız business.manage izniyle istenir', () => {
    const me = (codes: string[]) => ({
      activeBusiness: { permissions: codes.map((code) => ({ code, scope: 'all' as const })) },
    });
    expect(canManageBusiness(me(['business.manage']))).toBe(true);
    expect(canManageBusiness(me(['orders.view']))).toBe(false);
    expect(canManageBusiness({})).toBe(false);
  });
});
