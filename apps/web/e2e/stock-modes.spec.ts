// F3.10 (web): stok rejimi ayarı ve ürün kartında var/yok (US-038 AC1–AC2). Varsayılan "Var / yoxdur";
// "Miqdar" F3.11b'den beri seçilebilir (iki adımlı geçiş stock.spec.ts'te). Varyant "Yoxdur" yapılır, yenilemeden sonra kalır; "İzlənmir" seçilince kart
// gizlenir, geri dönünce işaret yeniden görünür. SHOTS verilirse ekran görüntüsü (yalnız yerel).
import { randomUUID } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';
import { addMembership, addSubscription, createUser, loginThroughUi } from './fixtures';

test.describe.configure({ timeout: 180_000 });

const SHOTS = process.env.SHOTS;

async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS !== undefined && SHOTS !== '') {
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
  }
}

async function chooseMode(page: Page, mode: 'none' | 'availability'): Promise<void> {
  await page.goto('/az/seller/settings');
  await page.getByRole('tab', { name: 'Stok' }).click();
  await page.getByTestId(`stock-mode-${mode}`).locator('input').check();
  await page.getByRole('button', { name: 'Yadda saxla' }).click();
  await expect(page.getByRole('status')).toBeVisible();
}

test('F3.10-AC1 F3.10-AC2 stok rejimi seçimi, varyantı "yoxdur" işarələmək və rejim dəyişəndə kart', async ({
  page,
}) => {
  const id = randomUUID().replaceAll('-', '').slice(0, 8);
  const sellerAdmin = await createUser('az');
  const { businessId: sellerId } = await addMembership(
    sellerAdmin.id,
    'seller_business_admin',
    `E2E Stok Topdan ${id}`,
  );
  await addSubscription(sellerId, 'pilot');

  await loginThroughUi(page, 'az', sellerAdmin.phone);
  await page.waitForURL('**/az/seller');

  // Varsayılan rejim "Var / yoxdur"; "Miqdar" seçilebilir (F3.11b).
  await page.goto('/az/seller/settings');
  await page.getByRole('tab', { name: 'Stok' }).click();
  await expect(page.getByTestId('stock-mode-availability').locator('input')).toBeChecked();
  await expect(page.getByTestId('stock-mode-quantity').locator('input')).toBeEnabled();
  await shot(page, '1-stok-rejimi-az');

  // Ürün (qaralama) açılır; kartda variant "Var".
  await page.goto('/az/seller/products/new');
  const form = page.getByTestId('product-form');
  await form.locator('input[name="sku"]').fill(`STK-${id}`);
  await form.locator('input[name="name.az"]').fill(`Şampun ${id}`);
  await form.locator('#product-category').selectOption({ index: 1 });
  await form.locator('input[name="variants.0.sku"]').fill(`STK-${id}-1`);
  await page.getByRole('button', { name: 'Qaralama kimi saxla' }).click();
  await page.waitForURL(/\/az\/seller\/products\/[0-9a-f-]{36}\?created=1$/);
  const productUrl = page.url().replace('?created=1', '');

  const row = page.getByTestId('availability-row').first();
  const toggle = row.getByTestId('availability-switch');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(toggle).toHaveText('Var');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(toggle).toHaveText('Yoxdur');
  await shot(page, '2-variant-yoxdur-az');

  await page.reload();
  await expect(
    page.getByTestId('availability-row').first().getByTestId('availability-switch'),
  ).toHaveAttribute('aria-checked', 'false');

  // "İzlənmir": kart görünmür; geri dönünce işaret yenidən görünür.
  await chooseMode(page, 'none');
  await expect(
    page.getByText('Variantların "yoxdur" işarələri saxlanılır', { exact: false }),
  ).toBeVisible();
  await shot(page, '3-izlenmir-az');
  await page.goto(productUrl);
  await expect(page.getByTestId('product-form')).toBeVisible();
  await expect(page.getByTestId('availability-row')).toHaveCount(0);

  await chooseMode(page, 'availability');
  await page.goto(productUrl);
  await expect(
    page.getByTestId('availability-row').first().getByTestId('availability-switch'),
  ).toHaveAttribute('aria-checked', 'false');

  // Dar ekran.
  await page.setViewportSize({ width: 390, height: 844 });
  await shot(page, '4-dar-ekran-az');
});
