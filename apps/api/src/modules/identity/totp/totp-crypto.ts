// TOTP sırrının şifrelenmesi (F1.6, Mimar kararı K1): AES-256-GCM, anahtar TOTP_ENCRYPTION_KEY
// (32 bayt). Her şifrelemede yeni rastgele 12 baytlık nonce; ek doğrulama verisi (AAD) kullanıcı
// kimliği: bir kullanıcının şifreli sırrı başka kullanıcının satırına taşınırsa çözülmez.
// Saklama biçimi: nonce (12) ‖ etiket (16) ‖ şifreli metin.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
export const TOTP_KEY_BYTES = 32;

export function encryptTotpSecret(key: Buffer, userId: string, secret: string): Buffer {
  if (key.length !== TOTP_KEY_BYTES) throw new Error('TOTP şifreleme anahtarı 32 bayt olmalı');
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, nonce);
  cipher.setAAD(Buffer.from(userId, 'utf8'));
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]);
}

/** Çözülemezse (yanlış anahtar, kullanıcı veya bozuk veri) hata atar; ayrıntı verilmez. */
export function decryptTotpSecret(key: Buffer, userId: string, payload: Buffer): string {
  if (payload.length <= NONCE_BYTES + TAG_BYTES) throw new Error('TOTP sırrı çözülemedi');
  const nonce = payload.subarray(0, NONCE_BYTES);
  const tag = payload.subarray(NONCE_BYTES, NONCE_BYTES + TAG_BYTES);
  const encrypted = payload.subarray(NONCE_BYTES + TAG_BYTES);
  try {
    const decipher = createDecipheriv(ALGORITHM, key, nonce);
    decipher.setAAD(Buffer.from(userId, 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('TOTP sırrı çözülemedi');
  }
}
