import { defineConfig } from 'vitest/config';

// Entegrasyon ve kiracı izolasyonu testleri: gerçek PostgreSQL (test/db.ts).
// Çalıştırma: pnpm test:integration (hepsi) · pnpm test:isolation (yalnızca *.isolation.test.ts)
export default defineConfig({
  test: {
    include: ['src/**/*.int.test.ts', 'src/**/*.isolation.test.ts'],
    environment: 'node',
    globalSetup: ['test/db.ts'],
    setupFiles: ['test/setup-env.ts'],
    // Dosyalar aynı test veritabanını ve örnek tabloyu kullanır; sırayla çalışır.
    fileParallelism: false,
    hookTimeout: 120_000,
  },
});
