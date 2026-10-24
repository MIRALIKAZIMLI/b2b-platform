// Ortam değişkeni şeması (packages/shared/src/env.ts) F1.1a / F1.2'de gelir.
// O zamana kadar yalnızca PORT burada doğrulanır.
const DEFAULT_PORT = 3000;
const MAX_PORT = 65_535;

export function readPort(env: NodeJS.ProcessEnv): number {
  const raw = env.PORT;
  if (raw === undefined || raw === '') {
    return DEFAULT_PORT;
  }
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > MAX_PORT) {
    throw new Error(`PORT geçersiz: "${raw}" (1-${String(MAX_PORT)} arasında tam sayı olmalı)`);
  }
  return port;
}
