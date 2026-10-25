import { configDefaults, defineConfig } from 'vitest/config';

// Backend kapsam eşiği (F1.5a; test-strategy §2, NFR-80/81, definition-of-done §3).
// Birim ve entegrasyon/izolasyon testleri tek çalıştırmada ölçülür: repository'ler ve SQL
// fonksiyonları yalnızca gerçek PostgreSQL ile test edilir. Gerçek PostgreSQL ve Redis gerekir
// (CI integration işi; yerelde Docker). Çalıştırma: pnpm test:coverage:backend. Eşik düşürülmez.
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text-summary', 'text'],
      thresholds: {
        lines: 70,
        // Domain servisleri ≥ %85; modülleri geldikçe bu desen onları kapsar.
        'src/modules/{pricing,inventory,connections,cart,orders,delivery,ledger}/**/*.ts': {
          lines: 85,
        },
      },
    },
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          exclude: [
            ...configDefaults.exclude,
            'src/**/*.int.test.ts',
            'src/**/*.isolation.test.ts',
          ],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'integration',
          include: ['src/**/*.int.test.ts', 'src/**/*.isolation.test.ts'],
          environment: 'node',
          globalSetup: ['test/db.ts'],
          setupFiles: ['test/setup-env.ts'],
          fileParallelism: false,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
