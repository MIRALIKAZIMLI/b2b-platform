import { defineConfig, devices } from '@playwright/test';

// Web uçtan uca (F1.13a). API (mock SMS, yerel DB) ve web üretim derlemesi webServer ile açılır;
// zaten çalışıyorsa yeniden kullanılır. CI işi F1.13b'de (E2E-01 ile).
const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3001';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI === undefined ? 'list' : 'github',
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Önceden kurulu tarayıcı (isteğe bağlı): PW_CHROMIUM_PATH.
        ...(process.env.PW_CHROMIUM_PATH === undefined
          ? {}
          : { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } }),
      },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @b2b/api build && pnpm --filter @b2b/api start',
      url: `${API_URL}/api/v1/i18n/az`,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'pnpm build && pnpm start',
      url: `${WEB_URL}/az/login`,
      reuseExistingServer: true,
      timeout: 240_000,
      env: { API_URL },
    },
  ],
});
