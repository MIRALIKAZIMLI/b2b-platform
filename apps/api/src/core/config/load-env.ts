// Açılışta ortam doğrulaması (environments-cicd.md §1 kural 3): geçersizse süreç başlamaz.
// Mesajda yalnızca değişken adları vardır (parseServerEnv); değerler yazılmaz.
import { parseServerEnv, type ServerEnv } from '@b2b/shared';

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

export function loadServerEnv(
  env: Record<string, string | undefined>,
  io: EnvExitIo = processIo,
): ServerEnv {
  try {
    return parseServerEnv(env);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ortam değişkenleri geçersiz';
    io.writeError(`Başlatılamadı. ${message}\n`);
    return io.exit(1);
  }
}
