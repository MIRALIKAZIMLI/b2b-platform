import { defineConfig } from 'vitest/config';

// Mobil birim testleri (F1.14a): yalnızca saf TS mantığı (oturum, API, giriş akışı, dil).
// React Native bileşenleri Node'da çalışmaz; ekranlar telefonda elle, F1.14b'de Maestro ile denenir.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
