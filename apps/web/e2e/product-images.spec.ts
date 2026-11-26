// F3.4b (web): ürün görselleri (US-030 AC3). Yeni üründe "önce kaydedin" notu; kayıttan sonra PNG
// yüklenir ve kutucuk "Hazırlanır…" görünür (E2E'de worker yok; küçültme F3.4a entegrasyon
// testinde); tür dışı dosya istemcide reddedilir; görsel silinir. Kaydedilmemiş düzenlemeyle
// arşivleme önce sorulur (Müfettiş #78 notu).
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { addMembership, addSubscription, createUser, loginThroughUi } from './fixtures';

test.describe.configure({ timeout: 120_000 });

// 1×1 PNG (imza + IHDR + IDAT + IEND).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

test('F3.4b-AC3 F3.4b-ORD ürün görseli yüklenir, işlenir durumu görünür, silinir', async ({
  page,
}) => {
  const admin = await createUser('az');
  const { businessId } = await addMembership(admin.id, 'seller_business_admin', 'E2E Şəkil Topdan');
  await addSubscription(businessId, 'pilot');
  const id = randomUUID().replaceAll('-', '').slice(0, 8);
  const sku = `IMG-${id}`;

  await loginThroughUi(page, 'az', admin.phone);
  await page.waitForURL('**/az/seller');
  await page.goto('/az/seller/products/new');
  const images = page.getByTestId('product-images');
  await expect(images).toContainText('əvvəlcə məhsulu qaralama kimi saxlayın');

  const form = page.getByTestId('product-form');
  await form.locator('input[name="sku"]').fill(sku);
  await form.locator('input[name="name.az"]').fill(`Çay ${id}`);
  await form.locator('#product-category').selectOption({ index: 1 });
  await form.locator('input[name="variants.0.sku"]').fill(`${sku}-1`);
  await page.getByRole('button', { name: 'Qaralama kimi saxla' }).click();
  await page.waitForURL(/\/az\/seller\/products\/[0-9a-f-]{36}\?created=1$/);

  const input = page.getByTestId('product-image-input');
  await input.setInputFiles({ name: 'qeyd.txt', mimeType: 'text/plain', buffer: Buffer.from('x') });
  await expect(page.getByText('Yalnız JPEG, PNG və ya WebP faylı seçin.')).toBeVisible();

  await input.setInputFiles([
    { name: 'a.png', mimeType: 'image/png', buffer: PNG },
    { name: 'b.png', mimeType: 'image/png', buffer: PNG },
  ]);
  await expect(page.getByText('Şəkil yükləndi.')).toBeVisible();
  const tiles = page.getByTestId('product-image');
  await expect(tiles).toHaveCount(2);
  await expect(tiles.first()).toHaveAttribute('data-status', 'processing');
  await expect(tiles.first()).toContainText('Örtük');
  await expect(tiles.first()).toContainText('Hazırlanır…');

  await page.getByRole('button', { name: 'Örtük et' }).click();
  await expect(page.getByText('Sıra yadda saxlanıldı.')).toBeVisible();
  await page.getByRole('button', { name: 'Şəkil 2: sil' }).click();
  await expect(page.getByText('Şəkil silindi.')).toBeVisible();
  await expect(tiles).toHaveCount(1);

  // Kaydedilmemiş düzenleme + Arxivlə → önce sorulur; "Geri qayıt" düzenlemeyi korur.
  await form.locator('input[name="name.az"]').fill(`Çay dəyişdi ${id}`);
  await page.getByRole('button', { name: 'Arxivlə' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Saxlanmamış dəyişikliklər var');
  await dialog.getByRole('button', { name: 'Geri qayıt' }).click();
  await expect(form.locator('input[name="name.az"]')).toHaveValue(`Çay dəyişdi ${id}`);
  await page.getByRole('button', { name: 'Arxivlə' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Yenə də arxivlə' }).click();
  await expect(page.getByText('Məhsul arxivləndi.')).toBeVisible();
  // Arşivde görsel eylemleri yok.
  await expect(page.getByRole('button', { name: 'Şəkil əlavə et' })).toHaveCount(0);
});
