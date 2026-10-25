// TOTP sırrı şifrelemesi ve kurtarma kodları (birim, F1.6). Anahtarlar her çalıştırmada rastgele.
import { randomBytes, randomUUID } from 'node:crypto';
import { authenticator } from 'otplib';
import { describe, expect, it } from 'vitest';
import {
  findUnusedRecoveryCode,
  generateRecoveryCodes,
  hashRecoveryCode,
  RECOVERY_CODE_COUNT,
  RECOVERY_CODE_PATTERN,
} from '../recovery-codes';
import { decryptTotpSecret, encryptTotpSecret } from '../totp-crypto';

// Sır da rastgele (PR #19 dersi: depoda anahtar gibi görünen sabit yok).
const SECRET = authenticator.generateSecret(20);

describe('TOTP sırrı şifreleme (F1.6-AC5, Mimar kararı K1)', () => {
  const key = randomBytes(32);
  const userId = randomUUID();

  it('şifreli veri sırrı düz içermez ve geri çözülür', () => {
    const payload = encryptTotpSecret(key, userId, SECRET);

    expect(payload.toString('utf8')).not.toContain(SECRET);
    expect(payload.toString('latin1')).not.toContain(SECRET);
    expect(decryptTotpSecret(key, userId, payload)).toBe(SECRET);
  });

  it('her şifrelemede yeni rastgele nonce: aynı sır iki kez farklı çıktı verir', () => {
    const first = encryptTotpSecret(key, userId, SECRET);
    const second = encryptTotpSecret(key, userId, SECRET);

    expect(first.subarray(0, 12).equals(second.subarray(0, 12))).toBe(false);
    expect(first.equals(second)).toBe(false);
  });

  it('yanlış anahtar, başka kullanıcı (AAD) veya bozuk veri çözülmez', () => {
    const payload = encryptTotpSecret(key, userId, SECRET);
    const tampered = Buffer.from(payload);
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 1;

    expect(() => decryptTotpSecret(randomBytes(32), userId, payload)).toThrow();
    expect(() => decryptTotpSecret(key, randomUUID(), payload)).toThrow();
    expect(() => decryptTotpSecret(key, userId, tampered)).toThrow();
    expect(() => decryptTotpSecret(key, userId, Buffer.alloc(10))).toThrow();
  });

  it('32 bayt olmayan anahtar reddedilir', () => {
    expect(() => encryptTotpSecret(randomBytes(16), userId, SECRET)).toThrow();
  });
});

describe('kurtarma kodları (US-002 AC4, Mimar kararı K2)', () => {
  const hashKey = randomBytes(32).toString('hex');
  const userId = randomUUID();

  it('10 benzersiz kod, XXXXX-XXXXX biçiminde', () => {
    const codes = generateRecoveryCodes();

    expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
    expect(new Set(codes).size).toBe(RECOVERY_CODE_COUNT);
    for (const code of codes) expect(code).toMatch(RECOVERY_CODE_PATTERN);
  });

  it('özet kodu içermez; kullanılmamış kod bulunur, kullanılmış veya yanlış kod bulunmaz', () => {
    const codes = generateRecoveryCodes();
    const stored = codes.map((code) => ({
      hash: hashRecoveryCode(hashKey, userId, code),
      usedAt: null,
    }));
    const third = codes[2] ?? '';

    expect(stored[2]?.hash).not.toContain(third);
    expect(findUnusedRecoveryCode(hashKey, userId, third, stored)).toBe(2);
    expect(findUnusedRecoveryCode(hashKey, userId, third.toLowerCase(), stored)).toBe(2);

    const used = stored.map((entry, i) =>
      i === 2 ? { ...entry, usedAt: '2026-10-26T08:00:00Z' } : entry,
    );
    expect(findUnusedRecoveryCode(hashKey, userId, third, used)).toBe(-1);
    expect(findUnusedRecoveryCode(hashKey, userId, 'AAAAA-AAAAA', stored)).toBe(-1);
    expect(findUnusedRecoveryCode(hashKey, randomUUID(), third, stored)).toBe(-1);
  });
});
