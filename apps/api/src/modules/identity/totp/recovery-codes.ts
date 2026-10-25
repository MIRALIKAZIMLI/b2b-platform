// Kurtarma kodları (US-002 AC4, F1.6, Mimar kararı K2): 10 kod, kriptografik rastgele, biçim
// `XXXXX-XXXXX` (base32, 50 bit). Yalnızca HMAC-SHA256(OTP_HASH_KEY, 'recovery:'+userId+':'+kod)
// saklanır; karşılaştırma sabit sürelidir ve her kod bir kez kullanılır.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { RecoveryCodeHash } from '../identity.schema';

export const RECOVERY_CODE_COUNT = 10;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 karakter; 0/O, 1/I karışmaz
const HALF_LENGTH = 5;
export const RECOVERY_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/;

function randomHalf(): string {
  const bytes = randomBytes(HALF_LENGTH);
  let out = '';
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length] ?? '';
  return out;
}

export function generateRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => `${randomHalf()}-${randomHalf()}`);
}

export function hashRecoveryCode(key: string, userId: string, code: string): string {
  return createHmac('sha256', key).update(`recovery:${userId}:${code}`, 'utf8').digest('hex');
}

/**
 * Girilen kodun kullanılmamış bir koda eşleştiği sıra; yoksa -1. Tüm kodlar her seferinde
 * karşılaştırılır (eşleşmenin yeri zamandan anlaşılmaz).
 */
export function findUnusedRecoveryCode(
  key: string,
  userId: string,
  code: string,
  stored: readonly RecoveryCodeHash[],
): number {
  const actual = Buffer.from(hashRecoveryCode(key, userId, code.toUpperCase()), 'hex');
  let found = -1;
  stored.forEach((entry, index) => {
    const expected = Buffer.from(entry.hash, 'hex');
    const equal = expected.length === actual.length && timingSafeEqual(expected, actual);
    if (equal && entry.usedAt === null && found === -1) found = index;
  });
  return found;
}
