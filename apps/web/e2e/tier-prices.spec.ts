// F3.9 (web): ürün kartında kademeli indirim (US-037 AC1; S1 = A, S2 = A). Kademe tanımlanır,
// istemci kural hataları satıra iner, fiyat açıklamasında miktar girilince kademe indirimi görünür,
// bütün kademeler silinip kaydedilince kaldırılır; yalnız okuma izniyle çipler. SHOTS verilirse
// ekran görüntüsü (yalnız yerel).
import { randomUUID } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';
import {
  addMembership,
  addSubscription,
  createActiveConnection,
  createUser,
  loginThroughUi,
} from './fixtures';

test.describe.configure({ timeout: 180_000 });

const SHOTS = process.env.SHOTS;

async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS !== undefined && SHOTS !== '') {
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
  }
}

test('F3.9-AC1 F3.9-S2 kademe tanımı, kural hataları, açıklamada kademe indirimi ve kaldırma', async ({
  page,
}) => {
  const id = randomUUID().replaceAll('-', '').slice(0, 8);
  const sellerAdmin = await createUser('az');
  const buyerAdmin = await createUser('az');
  const buyerName = `E2E Pillə Market ${id}`;
  const { businessId: sellerId } = await addMembership(
    sellerAdmin.id,
    'seller_business_admin',
    `E2E Pillə Topdan ${id}`,
  );
  const { businessId: buyerId } = await addMembership(
    buyerAdmin.id,
    'buyer_business_admin',
    buyerName,
  );
  await addSubscription(sellerId, 'pilot');
  await addSubscription(buyerId, 'buyer_free');
  await createActiveConnection(sellerId, buyerId, sellerAdmin.id, buyerAdmin.id);

  await loginThroughUi(page, 'az', sellerAdmin.phone);
  await page.waitForURL('**/az/seller');

  await page.goto('/az/seller/prices');
  await page.getByRole('button', { name: 'Yeni siyahı' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('#price-list-name').fill('Əsas');
  await dialog.locator('#price-list-vat-rate').fill('18');
  await dialog.getByRole('button', { name: 'Yadda saxla' }).click();
  await expect(page.getByText('«Əsas» yadda saxlanıldı.')).toBeVisible();

  await page.goto('/az/seller/products/new');
  const form = page.getByTestId('product-form');
  await form.locator('input[name="sku"]').fill(`TIER-${id}`);
  await form.locator('input[name="name.az"]').fill(`Un ${id}`);
  await form.locator('#product-category').selectOption({ index: 1 });
  await form.locator('input[name="variants.0.sku"]').fill(`TIER-${id}-1`);
  await page.getByRole('button', { name: 'Qaralama kimi saxla' }).click();
  await page.waitForURL(/\/az\/seller\/products\/[0-9a-f-]{36}\?created=1$/);
  const priceRow = page.getByTestId('price-row').first();
  await priceRow.getByRole('textbox').fill('20');
  await page.getByTestId('price-save').click();
  await expect(priceRow.getByTestId('price-current')).toHaveText('İndi: 20.00 AZN');

  // Boş kart; iki kademe eklenir, ikincisinin indirimi küçük: satıra hata (S2 = A).
  const card = page.getByTestId('tier-packaging').first();
  await expect(card).toContainText('Pilləli endirim yoxdur.');
  await card.getByTestId('tier-add').click();
  await card.getByTestId('tier-add').click();
  const tierRows = card.getByTestId('tier-row');
  await tierRows.nth(0).getByRole('textbox').nth(0).fill('10');
  await tierRows.nth(0).getByRole('textbox').nth(1).fill('3');
  await tierRows.nth(1).getByRole('textbox').nth(0).fill('50');
  await tierRows.nth(1).getByRole('textbox').nth(1).fill('2');
  await card.getByTestId('tier-save').click();
  await expect(
    card.getByText('Böyük həddin endirimi kiçik həddinkindən çox olmalıdır.'),
  ).toBeVisible();
  await shot(page, '1-kural-hatasi');

  await tierRows.nth(1).getByRole('textbox').nth(1).fill('5,5');
  await card.getByTestId('tier-save').click();
  await expect(card.getByText('2 pillə yadda saxlanıldı və dərhal qüvvəyə mindi.')).toBeVisible();
  await expect(tierRows.nth(1).getByRole('textbox').nth(1)).toHaveValue('5.5');
  await shot(page, '2-kaydedildi');

  // Açıklama: miktar 12 → 20 × 0,97 = 19,40; miktar boş → indirim yok.
  await page.locator('#price-explain-buyer').selectOption({ label: buyerName });
  const explain = priceRow.getByTestId('price-explain');
  await expect(explain).toContainText('20.00 AZN');
  await expect(priceRow.getByTestId('price-explain-tier')).toHaveCount(0);
  await page.locator('#price-explain-qty').fill('12');
  await expect(explain).toContainText('19.40 AZN');
  await expect(priceRow.getByTestId('price-explain-tier')).toContainText('−3%');
  await page.locator('#price-explain-qty').fill('60');
  await expect(explain).toContainText('18.90 AZN');
  await page.locator('#price-explain-qty').fill('0');
  await expect(page.getByText('Miqdar 0-dan böyük olmalı')).toBeVisible();
  await page.locator('#price-explain-qty').fill('12');
  await priceRow.scrollIntoViewIfNeeded();
  await shot(page, '3-aciklama-kademe');

  // Bütün kademeler silinip kaydedilince kaldırılır.
  await card.getByTestId('tier-remove').first().click();
  await card.getByTestId('tier-remove').first().click();
  await card.getByTestId('tier-save').click();
  await expect(card.getByText('Pilləli endirim silindi.')).toBeVisible();
  await expect(explain).toContainText('20.00 AZN');

  // Dar ekran.
  await card.getByTestId('tier-add').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await card.scrollIntoViewIfNeeded();
  await shot(page, '4-dar-ekran');
});
