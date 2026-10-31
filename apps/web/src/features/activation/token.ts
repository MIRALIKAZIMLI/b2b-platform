// Aktivasyon bağlantısı (F2.1b; F2.1a `activationLink`: `/<dil>/activate?token=<token>`).
// Token adresten okunur ve hemen silinir; yalnız bellekte tutulur (coding-guidelines §9.6).
// Saf fonksiyonlar; birim testli.

/** openapi `POST /team/invitations/accept` `token` sınırı. */
const TOKEN_MAX_LENGTH = 256;

/** Sorgudan token; yoksa, boşsa veya sınırı aşıyorsa `undefined`. */
export function readActivationToken(search: string): string | undefined {
  const token = new URLSearchParams(search).get('token');
  if (token === null || token === '' || token.length > TOKEN_MAX_LENGTH) return undefined;
  return token;
}

/** Token'sız adres: diğer sorgu parametreleri ve `#` korunur. */
export function addressWithoutToken(pathname: string, search: string, hash: string): string {
  const params = new URLSearchParams(search);
  params.delete('token');
  const query = params.toString();
  return `${pathname}${query === '' ? '' : `?${query}`}${hash}`;
}
