import 'reflect-metadata';
import { bootstrapApi } from './app.bootstrap';
import { runMain } from './core/bootstrap/run-main';
import { loadServerEnv } from './core/config/load-env';

// Geçersiz ortamla başlamaz: çıkış kodu 1, mesajda yalnızca değişken adı (loadServerEnv).
// Diğer açılış hataları güvenli loglanır, çıkış kodu 1 (runMain).
void runMain('api', async () => {
  await bootstrapApi(loadServerEnv(process.env));
});
