import { describe, expect, it } from 'vitest';
import { parseDbEnv, parseMigratorEnv } from '../env';

const APP_URL = 'postgres://app_user:secret-app@127.0.0.1:5432/b2b';
const MIGRATOR_URL = 'postgresql://migrator:secret-mig@127.0.0.1:5432/b2b';

describe('env: veritabanı değişkenleri', () => {
  it('geçerli değerler okunur, DB_POOL_MAX varsayılanı 10', () => {
    expect(parseDbEnv({ DATABASE_URL: APP_URL })).toEqual({ DATABASE_URL: APP_URL, DB_POOL_MAX: 10 });
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
    const message = (() => {
      try {
        parseDbEnv({ DATABASE_URL: APP_URL, DB_POOL_MAX: '-1' });
        return '';
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    })();

    expect(message).not.toContain('secret-app');
    expect(message).not.toContain('127.0.0.1');
  });
});
