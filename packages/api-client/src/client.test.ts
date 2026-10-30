import { describe, expect, expectTypeOf, it } from 'vitest';
import { type ApiClient, createApiClient } from './index';

function recordingFetch(status = 200, body = '{"status":"ok"}') {
  const requests: Request[] = [];
  const fetch = (request: Request): Promise<Response> => {
    requests.push(request);
    return Promise.resolve(
      new Response(body, { status, headers: { 'Content-Type': 'application/json' } }),
    );
  };
  return { requests, fetch };
}

describe('api-client', () => {
  it('F1.12-AC4: GET /api/health tip olarak doğru ve taban adrese gider', async () => {
    const { requests, fetch } = recordingFetch();
    const client: ApiClient = createApiClient({ baseUrl: 'https://api.test', fetch });

    const result = await client.GET('/api/health');

    expect(result.response.status).toBe(200);
    expect(requests[0]?.url).toBe('https://api.test/api/health');
    expectTypeOf(result.response).toEqualTypeOf<Response>();
    // Sözleşmede olmayan yol tip hatasıdır (pnpm typecheck bunu doğrular).
    // @ts-expect-error — /api/olmayan-uc openapi.yaml'da yok
    void client.GET('/api/olmayan-uc');
  });

  it('F1.12-AC4: me yanıtı sözleşme tipiyle döner', async () => {
    const { fetch } = recordingFetch(200, '{}');
    const client = createApiClient({ baseUrl: 'https://api.test', fetch });

    const { data } = await client.GET('/api/v1/me');

    expectTypeOf(data).not.toBeAny();
    expectTypeOf(data).toBeNullable();
  });

  it('başlıklar parametrelerden gelir (Authorization, X-Business-Id, Accept-Language)', async () => {
    const { requests, fetch } = recordingFetch();
    let token = 'birinci';
    const client = createApiClient({
      baseUrl: 'https://api.test',
      accessToken: () => token,
      businessId: '0190a000-0000-7000-8000-000000000001',
      language: 'az',
      fetch,
    });

    await client.GET('/api/health');
    token = 'ikinci';
    await client.GET('/api/health');

    expect(requests[0]?.headers.get('Authorization')).toBe('Bearer birinci');
    expect(requests[1]?.headers.get('Authorization')).toBe('Bearer ikinci');
    expect(requests[0]?.headers.get('X-Business-Id')).toBe('0190a000-0000-7000-8000-000000000001');
    expect(requests[0]?.headers.get('Accept-Language')).toBe('az');
  });

  it('verilmeyen başlık eklenmez', async () => {
    const { requests, fetch } = recordingFetch();
    const client = createApiClient({ baseUrl: 'https://api.test', fetch });

    await client.GET('/api/health');

    expect(requests[0]?.headers.has('Authorization')).toBe(false);
    expect(requests[0]?.headers.has('X-Business-Id')).toBe(false);
  });
});
