import { expect, test } from '@playwright/test';
import { createUser, loginThroughUi, preferredLanguage } from './fixtures';

test('F1.13-AC1: mock SMS koduyla web girişi; yenileme anahtarı httpOnly, JS okuyamaz', async ({
  page,
  context,
}) => {
  const user = await createUser();

  await loginThroughUi(page, 'az', user.phone);
  await page.waitForURL('**/az');

  const cookie = (await context.cookies()).find((c) => c.name === 'b2b_rt');
  expect(cookie).toBeDefined();
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.secure).toBe(true);
  expect(cookie?.sameSite).toBe('Strict');
  expect(cookie?.path).toBe('/api/v1/auth');
  expect(await page.evaluate(() => document.cookie)).not.toContain('b2b_rt');
  // Erişim anahtarı tarayıcı deposunda yok (yalnız bellekte).
  expect(await page.evaluate(() => JSON.stringify(window.localStorage))).toBe('{}');
  expect(await page.evaluate(() => JSON.stringify(window.sessionStorage))).toBe('{}');

  // Aynı köken (Next rewrite) üzerinden cookie ile yenileme: başlıksız 401 (TM-21), başlıkla 200.
  const rejected = await page.request.post('/api/v1/auth/refresh', {
    headers: { 'X-Client': 'web' },
    data: {},
  });
  expect(rejected.status()).toBe(401);
  const refreshed = await page.request.post('/api/v1/auth/refresh', {
    headers: { 'X-Client': 'web', 'X-Requested-With': 'fetch' },
    data: {},
  });
  expect(refreshed.status()).toBe(200);
  const body = (await refreshed.json()) as { accessToken?: string; refreshToken?: string };
  expect(body.accessToken).toBeTruthy();
  expect(body.refreshToken).toBeUndefined();
});

test('US-058 AC1: az/ru/tr geçişi; seçim profilde saklanır', async ({ page }) => {
  const user = await createUser();
  await loginThroughUi(page, 'az', user.phone);
  await page.waitForURL('**/az');

  await page.getByRole('button', { name: 'Русский' }).click();
  await page.waitForURL('**/ru');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await expect(page.getByRole('navigation', { name: 'Язык' })).toBeVisible();
  await expect.poll(() => preferredLanguage(user.id)).toBe('ru');

  await page.getByRole('button', { name: 'Türkçe' }).click();
  await page.waitForURL('**/tr');
  await expect.poll(() => preferredLanguage(user.id)).toBe('tr');

  // Sayfa yenilenince dil korunur.
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'tr');
});

test('US-058 AC1: profilde kayıtlı dil girişte uygulanır', async ({ page }) => {
  // Aynı numaraya 60 sn içinde ikinci kod gönderilmez (US-001 AC3); bu yüzden dili önceden kayıtlı
  // ayrı bir kullanıcı.
  const user = await createUser('ru');
  await loginThroughUi(page, 'az', user.phone);
  await page.waitForURL('**/ru');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
});

test('giriş ekranı seçilen dilde; pasif dil (en) açılmaz', async ({ page }) => {
  await page.goto('/ru/login');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Вход');
  await page.goto('/tr/login');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Giriş yap');
  const en = await page.goto('/en/login');
  expect(en?.status()).toBe(404);
});
