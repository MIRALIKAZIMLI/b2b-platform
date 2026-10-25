// Telefon doğrulama (openapi `PhoneE164`, F1.5a): istemci E.164 gönderir; numara
// `libphonenumber-js` ile geçerli bir numara olarak doğrulanır.
import { parsePhoneNumberFromString } from 'libphonenumber-js';

const E164_PATTERN = /^\+[1-9][0-9]{7,14}$/;

export interface ParsedPhone {
  /** E.164, ör. `+994501234567`. */
  readonly e164: string;
  /** Ülke kodu `+` ile, ör. `+994`. */
  readonly countryCode: string;
}

/** Geçerli E.164 numarası; değilse undefined. */
export function parsePhoneE164(raw: string): ParsedPhone | undefined {
  if (!E164_PATTERN.test(raw)) return undefined;
  const parsed = parsePhoneNumberFromString(raw);
  if (parsed?.isValid() !== true || parsed.number !== raw) return undefined;
  return { e164: parsed.number, countryCode: `+${parsed.countryCallingCode}` };
}
