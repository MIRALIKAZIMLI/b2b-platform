// Web yenileme anahtarı cookie'si (F1.13a, ADR-0006 madde 3, TM-04, TM-21). Yeni paket yok
// (@fastify/cookie listede değil): yalnızca bu cookie okunur ve yazılır.

export const REFRESH_COOKIE_NAME = 'b2b_rt';

/** Cookie yalnızca /auth uçlarına gider; diğer uçlar Bearer kullanır (TM-21). `Domain` yok. */
const ATTRIBUTES = 'HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth';

/** Yenileme anahtarı biçimi (base64url); başka karakter içeren değer cookie'ye yazılmaz. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,256}$/;

/** `X-Client: web` → yenileme anahtarı gövde yerine cookie'de. Başka değer veya yok → mobil. */
export function isWebClient(header: string | undefined): boolean {
  return header?.trim().toLowerCase() === 'web';
}

/** `X-Requested-With` başlığı dolu mu (CSRF: başka site bu başlığı CORS ön kontrolsüz ekleyemez). */
export function hasRequestedWith(header: string | undefined): boolean {
  return header !== undefined && header.trim().length > 0;
}

/** `Cookie` başlığından yenileme anahtarını okur; yoksa veya biçimsizse `undefined`. */
export function readRefreshCookie(header: string | undefined): string | undefined {
  if (header === undefined) return undefined;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() !== REFRESH_COOKIE_NAME) continue;
    const value = part.slice(index + 1).trim();
    return TOKEN_PATTERN.test(value) ? value : undefined;
  }
  return undefined;
}

export function refreshCookieHeader(token: string, maxAgeSeconds: number): string {
  if (!TOKEN_PATTERN.test(token)) throw new Error('refresh token: geçersiz biçim');
  return `${REFRESH_COOKIE_NAME}=${token}; ${ATTRIBUTES}; Max-Age=${String(Math.floor(maxAgeSeconds))}`;
}

export function clearRefreshCookieHeader(): string {
  return `${REFRESH_COOKIE_NAME}=; ${ATTRIBUTES}; Max-Age=0`;
}

/** Fastify yanıtından kullanılan kısım (fastify doğrudan bağımlılık değil). */
export interface CookieReply {
  header(name: string, value: string): unknown;
}

/**
 * Web istemcide yenileme anahtarını gövdeden çıkarıp cookie'ye yazar; mobilde yanıtı olduğu gibi
 * bırakır. Anahtarsız yanıt (ör. `nextStep: totp`) değişmez.
 */
export function deliverRefreshToken<T extends object>(
  result: T,
  web: boolean,
  reply: CookieReply,
  maxAgeSeconds: number,
): T | Omit<T, 'refreshToken'> {
  if (!web || !('refreshToken' in result) || typeof result.refreshToken !== 'string') return result;
  reply.header('Set-Cookie', refreshCookieHeader(result.refreshToken, maxAgeSeconds));
  const body: Partial<T> = { ...result };
  delete (body as { refreshToken?: unknown }).refreshToken;
  return body as Omit<T, 'refreshToken'>;
}
