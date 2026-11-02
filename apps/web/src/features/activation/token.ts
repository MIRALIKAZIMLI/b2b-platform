// Aktivasyon bağlantısı (F2.1b; F2.1a `activationLink`: `/<dil>/activate?token=<token>`).
// Token adresten okunur ve hemen silinir; yalnız bellekte tutulur (coding-guidelines §9.6).
// Saf fonksiyonlar; birim testli.

import { invitationToken } from '@b2b/shared';

/** Sorgudan token; yoksa, boşsa veya sınırı aşıyorsa `undefined` (kural `@b2b/shared`, mobil ile ortak). */
export function readActivationToken(search: string): string | undefined {
  return invitationToken(new URLSearchParams(search).get('token'));
}

/** Mobil uygulamada aynı daveti açan bağlantı (F2.7b; `app.json` `scheme: b2b`). */
export function appLink(token: string): string {
  return `b2b://activate?token=${encodeURIComponent(token)}`;
}

/** Telefon / tablet tarayıcısı mı (yalnız "Uygulamada aç" düğmesini göstermek için). */
export function isPhoneBrowser(userAgent: string): boolean {
  return /Android|iPhone|iPad|iPod/i.test(userAgent);
}

/** Token'sız adres: diğer sorgu parametreleri ve `#` korunur. */
export function addressWithoutToken(pathname: string, search: string, hash: string): string {
  const params = new URLSearchParams(search);
  params.delete('token');
  const query = params.toString();
  return `${pathname}${query === '' ? '' : `?${query}`}${hash}`;
}
