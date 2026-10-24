import { defineConfig } from 'vitest/config';

export default defineConfig({
  // tsconfig'te jsx "preserve" (Next.js derler); testlerde JSX'i Vite dönüştürür.
  oxc: {
    jsx: { runtime: 'automatic' },
  },
  test: {
    include: ['src/**/*.test.tsx'],
    environment: 'node',
    // Kapsam raporu: pnpm test:coverage (eşik F1.5a'da).
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      reporter: ['text-summary', 'text'],
    },
  },
});
