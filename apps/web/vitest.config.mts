import { defineConfig } from 'vitest/config';

export default defineConfig({
  // tsconfig'te jsx "preserve" (Next.js derler); testlerde JSX'i Vite dönüştürür.
  oxc: {
    jsx: { runtime: 'automatic' },
  },
  test: {
    include: ['src/**/*.test.tsx'],
    environment: 'node',
  },
});
