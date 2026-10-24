// db:bootstrap süper kullanıcıyla rol oluşturur; yalnızca local ve test ortamında çalışır.
// APP_ENV açıkça verilmelidir: eksikse varsayılan seçilmez, hata verilir.
const BOOTSTRAP_ENVS = new Set(['local', 'test']);

export function assertBootstrapAllowed(env: Record<string, string | undefined>): void {
  const appEnv = env.APP_ENV;
  if (appEnv === undefined || appEnv === '') {
    throw new Error('Ortam değişkeni eksik: APP_ENV (db:bootstrap için local veya test olmalı)');
  }
  if (!BOOTSTRAP_ENVS.has(appEnv)) {
    throw new Error(`db:bootstrap yalnızca local ve test ortamında çalışır (APP_ENV=${appEnv})`);
  }
}
