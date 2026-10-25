// OTP kodu üretimi ve özeti (F1.5a, Mimar kararı 1). Kod kriptografik rastgele (`randomInt`);
// veritabanında yalnızca HMAC-SHA256(OTP_HASH_KEY, challengeId + ':' + kod) saklanır. Karşılaştırma
// sabit zamanlıdır (`timingSafeEqual`). Anahtar veritabanında olmadığı için tablo sızsa da
// 6 haneli kodlar denenerek bulunamaz.
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

export const OTP_CODE_LENGTH = 6;
const CODE_UPPER_BOUND = 10 ** OTP_CODE_LENGTH;

/** 6 haneli kod (baştaki sıfırlar korunur). */
export function generateOtpCode(): string {
  return randomInt(0, CODE_UPPER_BOUND).toString().padStart(OTP_CODE_LENGTH, '0');
}

function hmacHex(key: string, message: string): string {
  return createHmac('sha256', key).update(message, 'utf8').digest('hex');
}

export function hashOtpCode(key: string, challengeId: string, code: string): string {
  return hmacHex(key, `otp:${challengeId}:${code}`);
}

/** Girilen kod saklanan özetle eşleşiyor mu (sabit zamanlı). */
export function otpCodeMatches(
  key: string,
  challengeId: string,
  code: string,
  storedHash: string,
): boolean {
  const expected = Buffer.from(storedHash, 'hex');
  const actual = Buffer.from(hashOtpCode(key, challengeId, code), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Redis anahtarlarında telefonun yerine kullanılan özet (telefon düz yazılmaz). */
export function phoneKey(key: string, phoneE164: string): string {
  return hmacHex(key, `phone:${phoneE164}`);
}

/** Redis anahtarlarında IP'nin yerine kullanılan özet. */
export function ipKey(key: string, ip: string): string {
  return hmacHex(key, `ip:${ip}`);
}
