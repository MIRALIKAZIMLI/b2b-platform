import { defineConfig } from 'vitest/config';

// Mobil birim testleri (F1.14a): yalnızca saf TS mantığı (oturum, API, giriş akışı, dil).
// React Native bileşenleri Node'da çalışmaz; ekran kararları saf modüllerde (F1.14b `shell-state`,
// `app-config`), ekranlar telefonda elle ve Maestro (`.maestro/`) ile denenir.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
