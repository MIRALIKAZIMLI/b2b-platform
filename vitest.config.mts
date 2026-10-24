import { defineConfig } from 'vitest/config';

// Kök testleri: depo genelindeki kurallar (ör. sabit paket sürümleri).
// Paket testleri kendi vitest.config dosyalarıyla `pnpm -r test` üzerinden çalışır.
export default defineConfig({
  test: {
    include: ['scripts/**/*.test.mts'],
    environment: 'node',
  },
});
