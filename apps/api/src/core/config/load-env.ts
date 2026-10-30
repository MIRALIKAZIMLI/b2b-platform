// Açılışta ortam doğrulaması (environments-cicd.md §1 kural 3): geçersizse süreç başlamaz.
// Mesajda yalnızca değişken adları vardır (parseServerEnv / parseApiEnv); değerler yazılmaz.
import {
  type ApiEnv,
  parseApiEnv,
  parseServerEnv,
  parseWorkerEnv,
  type ServerEnv,
  type WorkerEnv,
} from '@b2b/shared';

export interface EnvExitIo {
  writeError(message: string): void;
  exit(code: number): never;
}

const processIo: EnvExitIo = {
  writeError: (message) => {
    process.stderr.write(message);
  },
  exit: (code) => process.exit(code),
};

type RawEnv = Record<string, string | undefined>;

function loadOrExit<T>(parse: (env: RawEnv) => T, env: RawEnv, io: EnvExitIo): T {
  try {
    return parse(env);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ortam değişkenleri geçersiz';
    io.writeError(`Başlatılamadı. ${message}\n`);
    return io.exit(1);
  }
}

/** Sunucu şeması (ortak kısım). */
export function loadServerEnv(env: RawEnv, io: EnvExitIo = processIo): ServerEnv {
  return loadOrExit(parseServerEnv, env, io);
}

/** api açılışı: sunucu şeması + SMS ve OTP değişkenleri; production'da mock SMS reddedilir (NFR-97). */
export function loadApiEnv(env: RawEnv, io: EnvExitIo = processIo): ApiEnv {
  return loadOrExit(parseApiEnv, env, io);
}

/** Worker açılışı: sunucu şeması + push sağlayıcısı; production'da mock push reddedilir (F1.11). */
export function loadWorkerEnv(env: RawEnv, io: EnvExitIo = processIo): WorkerEnv {
  return loadOrExit(parseWorkerEnv, env, io);
}
