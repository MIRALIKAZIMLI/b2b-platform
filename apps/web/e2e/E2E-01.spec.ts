// E2E-01 (web) ve F1.13b kabuk testleri: mock SMS kutusundan kodla giriş, işletme seçimi, izinden
// menü, dil geçişi (test-strategy E2E-01; F1.13-AC4, AC5, AC6).
import { expect, type Page, test } from '@playwright/test';
import { addMembership, createUser, loginThroughUi } from './fixtures';

const menu = (page: Page, name: string) => page.getByRole('navigation', { name });
const menuKeys = async (page: Page, name: string) =>
  await menu(page, name)
    .locator('[data-menu-item]')
    .evaluateAll((items) => items.map((item) => item.getAttribute('data-menu-item')));

test('E2E-01: mock SMS kutusundan kodla giriş; toptancı açılış sayfası ve menü', async ({
  page,
}) => {
  const user = await createUser();
  await addMembership(user.id, 'seller_business_admin', 'E2E Topdan MMC');

  await loginThroughUi(page, 'az', user.phone);
  await page.waitForURL('**/az/seller');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('İdarə paneli');
  await expect(menu(page, 'Menyu')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Biznes' })).toHaveValue(/.+/);
  await expect(menu(page, 'Menyu').getByText('Komanda')).toBeVisible();
});

test('F1.13-AC4: işletme değiştirince menü değişir (toptancı → perakendeci)', async ({ page }) => {
  const user = await createUser();
  // İlk üyelik varsayılan seçilir (listede ilk sıra: list_my_memberships sırası).
  const seller = await addMembership(user.id, 'seller_sales_rep', 'E2E Satış MMC');
  const buyer = await addMembership(user.id, 'buyer_business_admin', 'E2E Mağaza MMC');

  await loginThroughUi(page, 'az', user.phone);
  await page.waitForURL(/\/az\/(seller|buyer)$/);
  const selector = page.getByRole('combobox', { name: 'Biznes' });

  await selector.selectOption(seller.businessId);
  await page.waitForURL('**/az/seller');
  await expect(menu(page, 'Menyu').getByText('Pərakəndəçi tap')).toBeVisible();
  const sellerKeys = await menuKeys(page, 'Menyu');
  expect(sellerKeys).toContain('directory');
  expect(sellerKeys).not.toContain('cart');

  await selector.selectOption(buyer.businessId);
  await page.waitForURL('**/az/buyer');
  await expect(menu(page, 'Menyu').getByText('Gələn sorğular')).toBeVisible();
  const buyerKeys = await menuKeys(page, 'Menyu');
  expect(buyerKeys).toContain('incoming_requests');
  expect(buyerKeys).toContain('team');
  expect(buyerKeys).not.toContain('directory');

  // Yanlış alana doğrudan gidilirse kendi açılış sayfasına dönülür.
  await page.goto('/az/admin');
  await page.waitForURL(/\/az\/(seller|buyer)$/);
});

test('F1.13-AC5: izni olmayan menü öğesi görünmez (Satış Temsilcisi)', async ({ page }) => {
  const user = await createUser();
  await addMembership(user.id, 'seller_sales_rep', 'E2E Temsilçi MMC');

  await loginThroughUi(page, 'az', user.phone);
  await page.waitForURL('**/az/seller');
  await expect(menu(page, 'Menyu')).toBeVisible();
  expect(await menuKeys(page, 'Menyu')).toEqual([
    'dashboard',
    'directory',
    'customers',
    'requests',
    'products',
    'prices',
    'orders',
    'ledger',
    'reports',
  ]);
  await expect(menu(page, 'Menyu').getByText('Komanda')).toHaveCount(0);
  await expect(menu(page, 'Menyu').getByText('Parametrlər')).toHaveCount(0);
});

test('F1.13-AC6: az/ru/tr geçişi menüde de geçerli', async ({ page }) => {
  const user = await createUser();
  await addMembership(user.id, 'buyer_business_admin', 'E2E Dil MMC');

  await loginThroughUi(page, 'az', user.phone);
  await page.waitForURL('**/az/buyer');
  await expect(menu(page, 'Menyu').getByText('Komanda')).toBeVisible();

  await page.getByRole('button', { name: 'Русский' }).click();
  await page.waitForURL('**/ru/buyer');
  await expect(menu(page, 'Меню').getByText('Команда')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Панель');
  await expect(page.getByRole('combobox', { name: 'Компания' })).toBeVisible();

  await page.getByRole('button', { name: 'Türkçe' }).click();
  await page.waitForURL('**/tr/buyer');
  await expect(menu(page, 'Menü').getByText('Ekip')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Panel');
});
