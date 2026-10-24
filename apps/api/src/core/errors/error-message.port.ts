// Hata mesajı çevirisi için kapı (F1.3). core modülleri içe aktaramaz (coding-guidelines §3);
// bu yüzden filtre yalnızca bu arayüzü bilir, uygulamasını i18n modülü verir.
import type { ErrorCode } from '@b2b/shared';

export const ERROR_MESSAGE_RESOLVER = Symbol('ERROR_MESSAGE_RESOLVER');

export interface ErrorMessageResolver {
  /**
   * `errors.<code>` çevirisinin `Accept-Language` dilindeki değeri (yoksa varsayılan dil,
   * o da yoksa kod). Hata atmamalıdır; atarsa filtre kodu mesaj olarak kullanır.
   */
  resolve(code: ErrorCode, acceptLanguage: string | undefined): Promise<string>;
}
