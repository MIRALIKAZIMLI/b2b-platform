import { configDefaults, defineConfig } from 'vitest/config';

// Birim testleri: veritabanı gerektirmez.
// Veritabanı isteyen testler (*.int.test.ts, *.isolation.test.ts) vitest.integration.config.mts'de.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'src/**/*.int.test.ts', 'src/**/*.isolation.test.ts'],
    environment: 'node',
    // Kapsam raporu (yalnızca birim, eşiksiz): pnpm test:coverage. Backend kapsam eşiği birim +
    // entegrasyon birlikte ölçülür: vitest.coverage.config.mts (F1.5a).
    coverage: { provider: 'v8', include: ['src/**/*.ts'], reporter: ['text-summary', 'text'] },
  },
});
