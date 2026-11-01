// Sipariş gönderiminde VÖEN ön koşulu (US-006 AC4, AC5; sequence-flows §sepet "Alıcının VÖEN'i
// yok → 422 VOEN_REQUIRED"). Sepet onaya gönderme ucu F4'te bu fonksiyonu çağırır; istemci
// `VOEN_REQUIRED` alınca VÖEN ekranına (profil) yönlendirir.
// VARSAYIM (US-006): moderatör doğrulaması ön koşul değildir; yalnız VÖEN'in varlığı aranır.
import { DomainError } from '../../core/errors/domain-error';

export interface VoenHolder {
  readonly voen: string | null;
  readonly verifiedAt?: Date | null;
}

/** VÖEN yoksa `422 VOEN_REQUIRED`; doğrulanmamış VÖEN yeterlidir. */
export function requireVoen(business: VoenHolder): void {
  if (business.voen === null || business.voen === '') throw new DomainError('VOEN_REQUIRED');
}
