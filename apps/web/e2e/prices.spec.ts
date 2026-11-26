// F3.6b (web): fiyat listeleri, ürün formunda fiyat girişi, müşteriye liste atama ve fiyat kaynağı
// (US-034 AC1, AC2, AC5, AC6; K2 = A, K3). Ekran görüntüleri için SHOTS dizini verilirse her adımda
// kaydedilir (yalnız yerel; CI'da değişken yok).
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

test('F3.6b-AC1 F3.6b-K3 F3.6b-AC2 F3.6b-AC6 F3.6b-AC5 fiyat listeleri, fiyat girişi, atama ve kaynak', async ({
  page,
}) => {
  const id = randomUUID().replaceAll('-', '').slice(0, 8);
  const sellerAdmin = await createUser('az');
  const buyerAdmin = await createUser('az');
  const buyerName = `E2E Market ${id}`;
  const { businessId: sellerId } = await addMembership(
    sellerAdmin.id,
    'seller_business_admin',
    `E2E Qiymət Topdan ${id}`,
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

  // AC1: boş sayfa; ilk liste standart olur.
  await page.goto('/az/seller/prices');
  await expect(page.getByText('Hələ qiymət siyahısı yoxdur.')).toBeVisible();
  await shot(page, '1-bos');
  await page.getByRole('button', { name: 'Yeni siyahı' }).click();
  let dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Bu ilk siyahınızdır, standart siyahı olacaq.');
  await dialog.locator('#price-list-name').fill('Əsas');
  await dialog.locator('#price-list-vat-rate').fill('18,5');
  await shot(page, '2-yeni-siyahi');
  await dialog.getByRole('button', { name: 'Yadda saxla' }).click();
  await expect(page.getByText('«Əsas» yadda saxlanıldı.')).toBeVisible();
  const rows = page.getByTestId('price-list-row');
  await expect(rows.filter({ hasText: 'Əsas' })).toContainText('Standart');
  await expect(rows.filter({ hasText: 'Əsas' })).toContainText('ƏDV daxil, 18.50%');

  // İstemci doğrulaması: boş ad, geçersiz oran.
  await page.getByRole('button', { name: 'Yeni siyahı' }).click();
  dialog = page.getByRole('dialog');
  await dialog.locator('#price-list-vat-rate').fill('120');
  await dialog.getByRole('button', { name: 'Yadda saxla' }).click();
  await expect(dialog.getByText('Ad 1–120 simvol olmalıdır.')).toBeVisible();
  await expect(dialog.getByText('0 ilə 100 arasında')).toBeVisible();
  await shot(page, '3-xetalar');
  await dialog.locator('#price-list-name').fill('VIP');
  await dialog.locator('#price-list-vat-rate').fill('18');
  await dialog.getByRole('button', { name: 'ƏDV xaric' }).click();
  await dialog.getByRole('button', { name: 'Yadda saxla' }).click();
  await expect(page.getByText('«VIP» yadda saxlanıldı.')).toBeVisible();
  const vip = rows.filter({ hasText: 'VIP' });
  await expect(vip).toContainText('ƏDV xaric, 18.00%');
  // K3: standart listede "Arxivlə" yok.
  await expect(
    rows.filter({ hasText: 'Əsas' }).getByRole('button', { name: 'Arxivlə' }),
  ).toHaveCount(0);

  // AC2: müşteriye VIP atanır; satırda liste adı görünür.
  await page.goto('/az/seller/customers');
  const customer = page.getByRole('listitem').filter({ hasText: buyerName });
  await customer.getByRole('button', { name: 'Şərtləri təyin et' }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.locator('#terms-price-list')).toBeEnabled();
  await dialog.locator('#terms-price-list').selectOption({ label: 'VIP' });
  await shot(page, '4-musteri-siyahi-secimi');
  await dialog.getByRole('button', { name: 'Yadda saxla' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(customer).toContainText('Qiymət siyahısı: VIP');

  // K2 = A: atanmış liste arşivlenmez (409 mesajı); standart devri ve arşiv/geri alma.
  await page.goto('/az/seller/prices');
  await vip.getByRole('button', { name: 'Arxivlə' }).click();
  await expect(page.locator('p[role="alert"]')).toContainText(
    'Bu qiymət siyahısı müştərilərə təyin olunub',
  );
  await shot(page, '5-arxiv-409');
  await vip.getByRole('button', { name: 'Standart et' }).click();
  await expect(page.getByText('«VIP» indi standart siyahıdır.')).toBeVisible();
  const main = rows.filter({ hasText: 'Əsas' });
  await main.getByRole('button', { name: 'Arxivlə' }).click();
  await expect(main).toContainText('Arxiv');
  await shot(page, '6-arxiv-ve-standart');
  await main.getByRole('button', { name: 'Bərpa et' }).click();
  await expect(page.getByText('«Əsas» bərpa edildi.')).toBeVisible();

  // Ürün: kayıtlı üründe fiyat kartı; hemen geçerli fiyat, sonra ileri tarihli fiyat (AC6).
  await page.goto('/az/seller/products/new');
  const form = page.getByTestId('product-form');
  await form.locator('input[name="sku"]').fill(`PRC-${id}`);
  await form.locator('input[name="name.az"]').fill(`Şampun ${id}`);
  await form.locator('#product-category').selectOption({ index: 1 });
  await form.locator('input[name="variants.0.sku"]').fill(`PRC-${id}-1`);
  await page.getByRole('button', { name: 'Qaralama kimi saxla' }).click();
  await page.waitForURL(/\/az\/seller\/products\/[0-9a-f-]{36}\?created=1$/);

  const priceRow = page.getByTestId('price-row').first();
  await expect(priceRow.getByTestId('price-current')).toHaveText('Qiymət yoxdur');
  await expect(page.locator('#price-card-list')).toHaveValue(/.+/);
  await priceRow.getByRole('textbox').fill('abc');
  await page.getByTestId('price-save').click();
  await expect(priceRow.getByText('Məs. 12.50 (ən çox 4 onluq).')).toBeVisible();
  await priceRow.getByRole('textbox').fill('12,5');
  await page.getByTestId('price-save').click();
  await expect(page.getByText('1 qiymət yadda saxlanıldı və dərhal qüvvəyə mindi.')).toBeVisible();
  await expect(priceRow.getByTestId('price-current')).toHaveText('İndi: 12.50 AZN');

  await page.getByTestId('price-mode-scheduled').click();
  await expect(page.locator('#price-card-day')).not.toHaveValue('');
  await priceRow.getByRole('textbox').fill('13.25');
  await page.getByTestId('price-save').click();
  await expect(
    page.getByText(/1 qiymət yadda saxlanıldı; .* tarixindən qüvvəyə minəcək\./),
  ).toBeVisible();
  await expect(priceRow.getByTestId('price-scheduled')).toContainText('13.25 AZN');

  // AC5: müşteri seçilince fiyat ve kaynağı (atanmış liste VIP).
  await page.locator('#price-explain-buyer').selectOption({ label: buyerName });
  const explain = priceRow.getByTestId('price-explain');
  await expect(explain).toHaveAttribute('data-source', 'price_list');
  await expect(explain).toContainText('Müştəri üçün: 12.50 AZN');
  await expect(explain).toContainText('Təyin olunmuş siyahı: VIP');
  await priceRow.scrollIntoViewIfNeeded();
  await shot(page, '7-mehsul-qiymetleri');

  // Başka liste seçilince o listenin fiyatı yok.
  await page.locator('#price-card-list').selectOption({ label: 'Əsas' });
  await expect(priceRow.getByTestId('price-current')).toHaveText('Qiymət yoxdur');

  // Dar ekran (ui-guidelines): liste satırları ve eylemler alt alta.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/az/seller/prices');
  await expect(rows.first()).toBeVisible();
  await shot(page, '8-dar-ekran');
});
