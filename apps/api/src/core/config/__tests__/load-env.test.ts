import { describe, expect, it } from 'vitest';
import { loadApiEnv, loadServerEnv, type EnvExitIo } from '../load-env';

class ExitCalled extends Error {
  constructor(readonly code: number) {
    super(`exit ${String(code)}`);
  }
}

function fakeIo(): EnvExitIo & { readonly output: string[] } {
  const output: string[] = [];
  return {
    output,
    writeError: (message) => {
      output.push(message);
    },
    exit: (code) => {
      throw new ExitCalled(code);
    },
  };
}

const VALID = {
  APP_ENV: 'local',
  DATABASE_URL: 'postgres://app_user:secret-app@127.0.0.1:5432/b2b',
  REDIS_URL: 'redis://127.0.0.1:6379',
};

function runAndCatch(env: Record<string, string | undefined>, io: EnvExitIo): ExitCalled {
  try {
    loadServerEnv(env, io);
  } catch (error) {
    if (error instanceof ExitCalled) return error;
    throw error;
  }
  throw new Error('loadServerEnv çıkış yapmadı');
}

describe('loadServerEnv (api ve worker açılışı)', () => {
  it('geçerli ortamla şemayı döner, çıkış yapmaz', () => {
    const io = fakeIo();
    expect(loadServerEnv(VALID, io).PORT).toBe(3000);
    expect(io.output).toEqual([]);
  });

  it('F1.2-AC5: eksik DATABASE_URL → başlamaz (çıkış kodu 1)', () => {
    const io = fakeIo();
    const exit = runAndCatch({ ...VALID, DATABASE_URL: undefined }, io);

    expect(exit.code).toBe(1);
    expect(io.output.join('')).toMatch(/DATABASE_URL/);
  });

  it('F1.2-AC5: geçersiz APP_ENV → başlamaz (çıkış kodu 1)', () => {
    const io = fakeIo();
    const exit = runAndCatch({ ...VALID, APP_ENV: 'canli' }, io);

    expect(exit.code).toBe(1);
    expect(io.output.join('')).toMatch(/APP_ENV/);
  });

  it('F1.2-AC5: hata mesajı değeri içermez', () => {
    const io = fakeIo();
    runAndCatch({ ...VALID, APP_ENV: 'canli', REDIS_URL: 'http://:redis-secret@cache:1' }, io);

    const output = io.output.join('');
    expect(output).toMatch(/REDIS_URL/);
    for (const value of ['canli', 'redis-secret', 'secret-app', '127.0.0.1']) {
      expect(output).not.toContain(value);
    }
  });
});

describe('loadApiEnv (api açılışı, F1.5a)', () => {
  const API_VALID = {
    ...VALID,
    SMS_PROVIDER: 'mock',
    OTP_HASH_KEY: 'otp-hash-secret-value-0123456789abcdef',
  };

  function runApiAndCatch(env: Record<string, string | undefined>, io: EnvExitIo): ExitCalled {
    try {
      loadApiEnv(env, io);
    } catch (error) {
      if (error instanceof ExitCalled) return error;
      throw error;
    }
    throw new Error('loadApiEnv çıkış yapmadı');
  }

  it('geçerli ortamla şemayı döner', () => {
    const io = fakeIo();
    expect(loadApiEnv(API_VALID, io).SMS_PROVIDER).toBe('mock');
    expect(io.output).toEqual([]);
  });

  it('F1.5-AC7: APP_ENV=production + SMS_PROVIDER=mock → başlamaz (çıkış kodu 1)', () => {
    const io = fakeIo();
    const exit = runApiAndCatch({ ...API_VALID, APP_ENV: 'production' }, io);

    expect(exit.code).toBe(1);
    const output = io.output.join('');
    expect(output).toMatch(/SMS_PROVIDER/);
    expect(output).not.toContain('otp-hash-secret-value');
  });

  it('OTP_HASH_KEY yoksa başlamaz', () => {
    const io = fakeIo();
    const exit = runApiAndCatch({ ...API_VALID, OTP_HASH_KEY: undefined }, io);

    expect(exit.code).toBe(1);
    expect(io.output.join('')).toMatch(/OTP_HASH_KEY/);
  });
});
