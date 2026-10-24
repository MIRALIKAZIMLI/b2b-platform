import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Kapsam raporu: pnpm test:coverage (eşik F1.5a'da).
    coverage: { provider: 'v8', include: ['src/**/*.ts'], reporter: ['text-summary', 'text'] },
  },
});
