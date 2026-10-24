import { configDefaults, defineConfig } from 'vitest/config';

// Birim testleri: veritabanı gerektirmez.
// Veritabanı isteyen testler (*.int.test.ts, *.isolation.test.ts) vitest.integration.config.mts'de.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'src/**/*.int.test.ts', 'src/**/*.isolation.test.ts'],
    environment: 'node',
    // Kapsam raporu: pnpm test:coverage (eşik F1.5a'da).
    coverage: { provider: 'v8', include: ['src/**/*.ts'], reporter: ['text-summary', 'text'] },
  },
});
