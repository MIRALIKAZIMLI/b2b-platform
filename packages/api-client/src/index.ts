// Web ve mobil için API istemcisi (F1.12). Tipler openapi.yaml'dan üretilir (src/schema.d.ts).
import createClient, { type Client, type Middleware } from 'openapi-fetch';
import type { paths } from './schema';

export type { components, operations, paths } from './schema';

type Value = string | undefined;
type ValueSource = Value | (() => Value | Promise<Value>);

export interface ApiClientOptions {
  /** API taban adresi, ör. `https://api.staging.example.az` (yol `/api/v1/...` sözleşmeden gelir). */
  readonly baseUrl: string;
  /** Erişim anahtarı → `Authorization: Bearer <anahtar>`. Fonksiyon her istekte çağrılır. */
  readonly accessToken?: ValueSource;
  /** Aktif işletme → `X-Business-Id`. */
  readonly businessId?: ValueSource;
  /** Arayüz dili → `Accept-Language` (az, ru, tr). */
  readonly language?: ValueSource;
  /** Testler ve özel ortamlar için `fetch` yerine geçen fonksiyon. */
  readonly fetch?: (input: Request) => Promise<Response>;
}

export type ApiClient = Client<paths>;

async function resolve(source: ValueSource): Promise<Value> {
  return typeof source === 'function' ? source() : source;
}

function headersMiddleware(options: ApiClientOptions): Middleware {
  return {
    async onRequest({ request }) {
      const [accessToken, businessId, language] = await Promise.all([
        resolve(options.accessToken),
        resolve(options.businessId),
        resolve(options.language),
      ]);
      if (accessToken !== undefined) request.headers.set('Authorization', `Bearer ${accessToken}`);
      if (businessId !== undefined) request.headers.set('X-Business-Id', businessId);
      if (language !== undefined) request.headers.set('Accept-Language', language);
      return request;
    },
  };
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const client = createClient<paths>({
    baseUrl: options.baseUrl,
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });
  client.use(headersMiddleware(options));
  return client;
}
