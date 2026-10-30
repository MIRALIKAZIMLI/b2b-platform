import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
  parseApiEnv,
  parseDbEnv,
  parseMigratorEnv,
  parseSeedEnv,
  parseServerEnv,
  parseWorkerEnv,
} from '../env';

// Her çalıştırmada rastgele (depoda anahtar gibi görünen değer yok).
const TOTP_KEY = randomBytes(32).toString('base64');

const APP_URL = 'postgres://app_user:secret-app@127.0.0.1:5432/b2b';
const MIGRATOR_URL = 'postgresql://migrator:secret-mig@127.0.0.1:5432/b2b';
const REDIS_URL = 'redis://127.0.0.1:6379';

const SERVER_ENV = { APP_ENV: 'local', DATABASE_URL: APP_URL, REDIS_URL };

function errorMessage(fn: () => unknown): string {
  try {
    fn();
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

describe('env: veritabanı değişkenleri', () => {
  it('geçerli değerler okunur, DB_POOL_MAX varsayılanı 10', () => {
    expect(parseDbEnv({ DATABASE_URL: APP_URL })).toEqual({
      DATABASE_URL: APP_URL,
      DB_POOL_MAX: 10,
    });
    expect(parseDbEnv({ DATABASE_URL: APP_URL, DB_POOL_MAX: '4' }).DB_POOL_MAX).toBe(4);
    expect(parseMigratorEnv({ DATABASE_MIGRATOR_URL: MIGRATOR_URL })).toEqual({
      DATABASE_MIGRATOR_URL: MIGRATOR_URL,
    });
  });

  it('eksik veya hatalı değer reddedilir', () => {
    expect(() => parseDbEnv({})).toThrow(/DATABASE_URL/);
    expect(() => parseDbEnv({ DATABASE_URL: 'mysql://x@y/z' })).toThrow(/DATABASE_URL/);
    expect(() => parseDbEnv({ DATABASE_URL: APP_URL, DB_POOL_MAX: '0' })).toThrow(/DB_POOL_MAX/);
    expect(() => parseDbEnv({ DATABASE_URL: APP_URL, DB_POOL_MAX: 'çok' })).toThrow(/DB_POOL_MAX/);
    expect(() => parseMigratorEnv({})).toThrow(/DATABASE_MIGRATOR_URL/);
  });

  it('hata mesajı şifreyi veya adresi içermez', () => {
    const message = errorMessage(() => parseDbEnv({ DATABASE_URL: APP_URL, DB_POOL_MAX: '-1' }));

    expect(message).not.toContain('secret-app');
    expect(message).not.toContain('127.0.0.1');
  });
});

describe('env: sunucu şeması (api ve worker)', () => {
  it('geçerli değerler okunur; PORT 3000, LOG_LEVEL info, DB_POOL_MAX 10 varsayılan', () => {
    expect(parseServerEnv(SERVER_ENV)).toEqual({
      APP_ENV: 'local',
      PORT: 3000,
      DATABASE_URL: APP_URL,
      DB_POOL_MAX: 10,
      REDIS_URL,
      LOG_LEVEL: 'info',
    });
  });

  it('boş değer verilmemiş sayılır (varsayılan kullanılır)', () => {
    expect(parseServerEnv({ ...SERVER_ENV, PORT: '', LOG_LEVEL: '' })).toMatchObject({
      PORT: 3000,
      LOG_LEVEL: 'info',
    });
  });

  it('geçerli PORT, LOG_LEVEL ve rediss adresi okunur', () => {
    const env = parseServerEnv({
      ...SERVER_ENV,
      PORT: '4100',
      LOG_LEVEL: 'debug',
      REDIS_URL: 'rediss://cache.example:6380',
    });
    expect(env.PORT).toBe(4100);
    expect(env.LOG_LEVEL).toBe('debug');
    expect(env.REDIS_URL).toBe('rediss://cache.example:6380');
  });

  it('F1.2-AC5: eksik DATABASE_URL → başlamaz', () => {
    expect(() => parseServerEnv({ APP_ENV: 'local', REDIS_URL })).toThrow(/DATABASE_URL/);
  });

  it('F1.2-AC5: geçersiz APP_ENV → başlamaz', () => {
    expect(() => parseServerEnv({ ...SERVER_ENV, APP_ENV: 'prod' })).toThrow(/APP_ENV/);
    expect(() => parseServerEnv({ ...SERVER_ENV, APP_ENV: undefined })).toThrow(/APP_ENV/);
  });

  it('F1.2-AC5: eksik REDIS_URL veya geçersiz PORT / LOG_LEVEL → başlamaz', () => {
    expect(() => parseServerEnv({ ...SERVER_ENV, REDIS_URL: undefined })).toThrow(/REDIS_URL/);
    expect(() => parseServerEnv({ ...SERVER_ENV, REDIS_URL: 'http://x:1' })).toThrow(/REDIS_URL/);
    for (const port of ['abc', '0', '70000', '3000.5']) {
      expect(() => parseServerEnv({ ...SERVER_ENV, PORT: port })).toThrow(/PORT/);
    }
    expect(() => parseServerEnv({ ...SERVER_ENV, LOG_LEVEL: 'loud' })).toThrow(/LOG_LEVEL/);
  });

  it('F1.2-AC5: hata mesajı değeri içermez, yalnızca değişken adını verir', () => {
    const message = errorMessage(() =>
      parseServerEnv({
        APP_ENV: 'gizli-ortam',
        DATABASE_URL: 'postgres://app_user:secret-app@db.internal:5432/b2b?x=1 y',
        REDIS_URL: 'redis://:redis-secret@cache.internal:99999',
      }),
    );

    expect(message).toMatch(/APP_ENV/);
    expect(message).toMatch(/REDIS_URL/);
    for (const value of ['gizli-ortam', 'secret-app', 'db.internal', 'redis-secret', 'cache']) {
      expect(message).not.toContain(value);
    }
  });
});

describe('env: api (SMS ve OTP, F1.5a)', () => {
  const OTP_HASH_KEY = 'k'.repeat(32);
  const JWT_SIGNING_KEY = 'j'.repeat(32);
  const API_ENV = {
    ...SERVER_ENV,
    SMS_PROVIDER: 'mock',
    OTP_HASH_KEY,
    JWT_SIGNING_KEY,
    JWT_KEY_ID: 'k1',
    TOTP_ENCRYPTION_KEY: TOTP_KEY,
    STORAGE_PROVIDER: 'local',
  };

  const R2_ENV = {
    STORAGE_PROVIDER: 'r2',
    R2_ACCOUNT_ID: 'acc123',
    R2_ACCESS_KEY_ID: 'r2-access-id',
    R2_SECRET_ACCESS_KEY: 'r2-secret-value',
    R2_BUCKET_PUBLIC: 'prod-public',
    R2_BUCKET_PRIVATE: 'prod-private',
    FILES_PUBLIC_BASE_URL: 'https://cdn.example.com',
  };

  it('F1.10-AC5: production + STORAGE_PROVIDER=local reddedilir (ADR-0023)', () => {
    const message = errorMessage(() => parseApiEnv({ ...API_ENV, APP_ENV: 'production' }));

    expect(message).toMatch(/STORAGE_PROVIDER/);
    // r2 ile aynı ortamda depo hatası yok (SMS hatası ayrı kural).
    const r2Message = errorMessage(() =>
      parseApiEnv({ ...API_ENV, ...R2_ENV, APP_ENV: 'production' }),
    );
    expect(r2Message).not.toMatch(/STORAGE_PROVIDER/);
    expect(r2Message).not.toContain('r2-secret-value');
  });

  it('F1.10: r2 deposu R2_* ve FILES_PUBLIC_BASE_URL ister', () => {
    expect(parseApiEnv({ ...API_ENV, ...R2_ENV }).STORAGE_PROVIDER).toBe('r2');
    expect(() => parseApiEnv({ ...API_ENV, ...R2_ENV, R2_BUCKET_PRIVATE: undefined })).toThrow(
      /R2_BUCKET_PRIVATE/,
    );
    expect(() => parseApiEnv({ ...API_ENV, STORAGE_PROVIDER: 'minio' })).toThrow(
      /STORAGE_PROVIDER/,
    );
  });

  it('geçerli değerler okunur', () => {
    expect(parseApiEnv(API_ENV)).toMatchObject({ SMS_PROVIDER: 'mock', OTP_HASH_KEY });
    expect(parseApiEnv({ ...API_ENV, APP_ENV: 'staging' }).APP_ENV).toBe('staging');
  });

  it('F1.5-AC7: production + SMS_PROVIDER=mock reddedilir (NFR-97)', () => {
    const message = errorMessage(() => parseApiEnv({ ...API_ENV, APP_ENV: 'production' }));

    expect(message).toMatch(/SMS_PROVIDER/);
    expect(message).not.toContain(OTP_HASH_KEY);
  });

  it('OTP_HASH_KEY yoksa veya 32 karakterden kısaysa reddedilir; değer mesajda yok', () => {
    expect(() => parseApiEnv({ ...API_ENV, OTP_HASH_KEY: undefined })).toThrow(/OTP_HASH_KEY/);
    const message = errorMessage(() => parseApiEnv({ ...API_ENV, OTP_HASH_KEY: 'kisa-gizli' }));
    expect(message).toMatch(/OTP_HASH_KEY/);
    expect(message).not.toContain('kisa-gizli');
  });

  it('SMS_PROVIDER yoksa veya bilinmiyorsa reddedilir', () => {
    expect(() => parseApiEnv({ ...API_ENV, SMS_PROVIDER: undefined })).toThrow(/SMS_PROVIDER/);
    expect(() => parseApiEnv({ ...API_ENV, SMS_PROVIDER: 'twilio' })).toThrow(/SMS_PROVIDER/);
  });

  it('worker şeması SMS ve OTP değişkenlerini istemez', () => {
    expect(() => parseServerEnv(SERVER_ENV)).not.toThrow();
  });
});

describe('env: api JWT anahtarları (F1.5b, Mimar kararı K1)', () => {
  const API_ENV = {
    ...SERVER_ENV,
    SMS_PROVIDER: 'mock',
    OTP_HASH_KEY: 'k'.repeat(32),
    JWT_SIGNING_KEY: 'jwt-secret-value-'.padEnd(32, 'x'),
    JWT_KEY_ID: 'k1',
    TOTP_ENCRYPTION_KEY: TOTP_KEY,
    STORAGE_PROVIDER: 'local',
  };

  it('JWT_SIGNING_KEY yoksa veya 32 karakterden kısaysa reddedilir; değer mesajda yok', () => {
    expect(() => parseApiEnv({ ...API_ENV, JWT_SIGNING_KEY: undefined })).toThrow(
      /JWT_SIGNING_KEY/,
    );
    const message = errorMessage(() =>
      parseApiEnv({ ...API_ENV, JWT_SIGNING_KEY: 'kisa-jwt-gizli' }),
    );
    expect(message).toMatch(/JWT_SIGNING_KEY/);
    expect(message).not.toContain('kisa-jwt-gizli');
  });

  it('JWT_KEY_ID yoksa veya biçimi yanlışsa reddedilir', () => {
    expect(() => parseApiEnv({ ...API_ENV, JWT_KEY_ID: undefined })).toThrow(/JWT_KEY_ID/);
    expect(() => parseApiEnv({ ...API_ENV, JWT_KEY_ID: 'a b' })).toThrow(/JWT_KEY_ID/);
  });

  it('önceki anahtar ve kimliği birlikte verilir; kimlik güncel kimlikle aynı olamaz', () => {
    const previous = 'p'.repeat(32);
    expect(
      parseApiEnv({ ...API_ENV, JWT_PREVIOUS_SIGNING_KEY: previous, JWT_PREVIOUS_KEY_ID: 'k0' }),
    ).toMatchObject({ JWT_PREVIOUS_KEY_ID: 'k0' });
    expect(() => parseApiEnv({ ...API_ENV, JWT_PREVIOUS_SIGNING_KEY: previous })).toThrow(
      /JWT_PREVIOUS_KEY_ID/,
    );
    expect(() => parseApiEnv({ ...API_ENV, JWT_PREVIOUS_KEY_ID: 'k0' })).toThrow(
      /JWT_PREVIOUS_SIGNING_KEY/,
    );
    expect(() =>
      parseApiEnv({ ...API_ENV, JWT_PREVIOUS_SIGNING_KEY: previous, JWT_PREVIOUS_KEY_ID: 'k1' }),
    ).toThrow(/JWT_PREVIOUS_KEY_ID/);
  });
});

describe('env: TOTP ve seed (F1.6, Mimar kararı K1)', () => {
  const API_ENV = {
    ...SERVER_ENV,
    SMS_PROVIDER: 'mock',
    OTP_HASH_KEY: 'k'.repeat(32),
    JWT_SIGNING_KEY: 'j'.repeat(32),
    JWT_KEY_ID: 'k1',
    TOTP_ENCRYPTION_KEY: TOTP_KEY,
    STORAGE_PROVIDER: 'local',
  };

  it('TOTP_ENCRYPTION_KEY: base64 ve tam 32 bayt olmalı; yoksa api açılmaz, değer mesajda yok', () => {
    expect(parseApiEnv(API_ENV).TOTP_ENCRYPTION_KEY).toBe(TOTP_KEY);
    const short = randomBytes(16).toString('base64');
    const long = randomBytes(48).toString('base64');
    for (const value of [undefined, short, long, 'base64-degil!']) {
      const message = errorMessage(() => parseApiEnv({ ...API_ENV, TOTP_ENCRYPTION_KEY: value }));
      expect(message, String(value)).toMatch(/TOTP_ENCRYPTION_KEY/);
      if (value !== undefined) expect(message).not.toContain(value);
    }
  });

  it('SUPER_ADMIN_PHONE isteğe bağlı; verilirse E.164 olmalı', () => {
    expect(parseSeedEnv({})).toEqual({});
    expect(parseSeedEnv({ SUPER_ADMIN_PHONE: '' })).toEqual({});
    expect(parseSeedEnv({ SUPER_ADMIN_PHONE: '+994501234567' })).toEqual({
      SUPER_ADMIN_PHONE: '+994501234567',
    });
    expect(() => parseSeedEnv({ SUPER_ADMIN_PHONE: '0501234567' })).toThrow(/SUPER_ADMIN_PHONE/);
  });
});

describe('env: worker push sağlayıcısı (F1.11)', () => {
  const WORKER_ENV = { ...SERVER_ENV, PUSH_PROVIDER: 'mock' };

  it('geçerli değerler okunur; EXPO_ACCESS_TOKEN isteğe bağlı', () => {
    expect(parseWorkerEnv(WORKER_ENV)).toMatchObject({ PUSH_PROVIDER: 'mock' });
    expect(parseWorkerEnv(WORKER_ENV).EXPO_ACCESS_TOKEN).toBeUndefined();
    const token = randomBytes(12).toString('hex');
    expect(
      parseWorkerEnv({ ...WORKER_ENV, PUSH_PROVIDER: 'expo', EXPO_ACCESS_TOKEN: token }),
    ).toMatchObject({ PUSH_PROVIDER: 'expo', EXPO_ACCESS_TOKEN: token });
  });

  it('PUSH_PROVIDER yoksa veya bilinmiyorsa reddedilir', () => {
    expect(() => parseWorkerEnv(SERVER_ENV)).toThrow(/PUSH_PROVIDER/);
    expect(() => parseWorkerEnv({ ...WORKER_ENV, PUSH_PROVIDER: 'fcm' })).toThrow(/PUSH_PROVIDER/);
  });

  it('production + PUSH_PROVIDER=mock reddedilir; expo kabul', () => {
    const token = randomBytes(12).toString('hex');
    const message = errorMessage(() =>
      parseWorkerEnv({ ...WORKER_ENV, APP_ENV: 'production', EXPO_ACCESS_TOKEN: token }),
    );
    expect(message).toMatch(/PUSH_PROVIDER/);
    expect(message).not.toContain(token);
    expect(
      parseWorkerEnv({ ...WORKER_ENV, APP_ENV: 'production', PUSH_PROVIDER: 'expo' }).APP_ENV,
    ).toBe('production');
  });
});
