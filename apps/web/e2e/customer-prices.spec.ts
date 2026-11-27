// F3.7b (web): müşteriye özel fiyat (US-035 AC1–AC2; S1 = A, S2 = A) ve #85 sihirbaz notları.
// Ürün kartında müşteri fiyatı, müşterinin "Xüsusi qiymətlər" sayfasında ileri tarih ve kaldırma,
// içe aktarma sihirbazında müşteri fiyatı türü. Worker olmadığından önizleme yanıtları taklit edilir
// (doğrulama ve uygulama F3.7a entegrasyon testlerinde). SHOTS verilirse ekran görüntüsü (yalnız yerel).
import { randomUUID } from 'node:crypto';
import { expect, type Page, type Route, test } from '@playwright/test';
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

const XLSX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(60)]);

async function sellerWithCustomer() {
  const id = randomUUID().replaceAll('-', '').slice(0, 8);
  const sellerAdmin = await createUser('az');
  const buyerAdmin = await createUser('az');
  const buyerName = `E2E Müştəri ${id}`;
  const { businessId: sellerId } = await addMembership(
    sellerAdmin.id,
    'seller_business_admin',
    `E2E Xüsusi Topdan ${id}`,
  );
  const { businessId: buyerId } = await addMembership(
    buyerAdmin.id,
    'buyer_business_admin',
    buyerName,
  );
  await addSubscription(sellerId, 'pilot');
  await addSubscription(buyerId, 'buyer_free');
  await createActiveConnection(sellerId, buyerId, sellerAdmin.id, buyerAdmin.id);
  return { id, sellerAdmin, sellerId, buyerId, buyerName };
}

test('F3.7b-AC1 F3.7b-S1 ürün kartında müşteri fiyatı; müşteri sayfasında ileri tarih ve kaldırma', async ({
  page,
}) => {
  const { id, sellerAdmin, buyerId, buyerName } = await sellerWithCustomer();
  await loginThroughUi(page, 'az', sellerAdmin.phone);
  await page.waitForURL('**/az/seller');

  // Standart liste ve liste fiyatı 10.
  await page.goto('/az/seller/prices');
  await page.getByRole('button', { name: 'Yeni siyahı' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('#price-list-name').fill('Əsas');
  await dialog.locator('#price-list-vat-rate').fill('18');
  await dialog.getByRole('button', { name: 'Yadda saxla' }).click();
  await expect(page.getByText('«Əsas» yadda saxlanıldı.')).toBeVisible();

  // Müşterinin sayfası önce boş.
  await page.goto('/az/seller/customers');
  const customer = page.getByRole('listitem').filter({ hasText: buyerName });
  await customer.getByTestId('customer-prices-link').click();
  await page.waitForURL(`**/az/seller/customers/${buyerId}/prices`);
  await expect(page.getByText('Xüsusi qiymət yoxdur')).toBeVisible();
  await expect(page.getByText(buyerName)).toBeVisible();
  await shot(page, '1-bos-musteri-sayfasi');

  await page.goto('/az/seller/products/new');
  const form = page.getByTestId('product-form');
  await form.locator('input[name="sku"]').fill(`CPR-${id}`);
  await form.locator('input[name="name.az"]').fill(`Çay ${id}`);
  await form.locator('#product-category').selectOption({ index: 1 });
  await form.locator('input[name="variants.0.sku"]').fill(`CPR-${id}-1`);
  await page.getByRole('button', { name: 'Qaralama kimi saxla' }).click();
  await page.waitForURL(/\/az\/seller\/products\/[0-9a-f-]{36}\?created=1$/);
  const priceRow = page.getByTestId('price-row').first();
  await priceRow.getByRole('textbox').fill('10');
  await page.getByTestId('price-save').click();
  await expect(priceRow.getByTestId('price-current')).toHaveText('İndi: 10.00 AZN');

  // AC1: müşteri seçilir, müşteri fiyatı yazılır, kaynak "customer_price" olur.
  await page.locator('#price-explain-buyer').selectOption({ label: buyerName });
  const explain = priceRow.getByTestId('price-explain');
  await expect(explain).toHaveAttribute('data-source', 'default_list');
  const inline = priceRow.getByTestId('customer-price-inline');
  await inline.getByRole('textbox').fill('8,5');
  await inline.getByRole('button', { name: 'Müştəriyə saxla' }).click();
  await expect(inline.getByText('Müştəri qiyməti saxlanıldı')).toBeVisible();
  await expect(explain).toHaveAttribute('data-source', 'customer_price');
  await expect(explain).toContainText('8.50 AZN');
  await priceRow.scrollIntoViewIfNeeded();
  await shot(page, '2-mehsul-karti-musteri-qiymeti');

  // Müşteri sayfası: satır, ileri tarihli fiyat, kaldırma (S1 = A).
  await page.goto(`/az/seller/customers/${buyerId}/prices`);
  const row = page.getByTestId('customer-price-row').first();
  await expect(row).toContainText(`CPR-${id}-1`);
  await expect(row.getByTestId('customer-price-current')).toContainText('8.50 AZN');
  await row.getByRole('button', { name: 'Dəyiş' }).click();
  await row.getByRole('textbox').first().fill('7');
  await row.getByRole('button', { name: 'Tarixdən' }).click();
  await row.getByTestId('customer-price-save').click();
  await expect(row.getByTestId('customer-price-scheduled')).toContainText('7.00 AZN');
  await expect(row.getByTestId('customer-price-current')).toContainText('8.50 AZN');
  await shot(page, '3-ileri-tarih');

  await row.getByRole('button', { name: 'Sil' }).click();
  await expect(row).toContainText('Müştəri yenidən siyahı qiymətini görəcək.');
  await shot(page, '4-silme-onayi');
  await row.getByTestId('customer-price-remove-confirm').click();
  await expect(page.getByText('Xüsusi qiymət yoxdur')).toBeVisible();

  // Dar ekran.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/az/seller/customers');
  await expect(customer.getByTestId('customer-prices-link')).toBeVisible();
  await shot(page, '5-dar-ekran');
});

test('F3.7b-AC2 F3.7b-K11 sihirbazda müşteri fiyatı türü; canApply ve geçici yükleme hatası (#85)', async ({
  page,
}) => {
  const { sellerAdmin, buyerId, buyerName } = await sellerWithCustomer();
  await loginThroughUi(page, 'az', sellerAdmin.phone);
  await page.waitForURL('**/az/seller');

  // Müşteri sayfasından gelinince tür ve müşteri seçili.
  await page.goto(`/az/seller/customers/${buyerId}/prices`);
  await page.getByTestId('customer-prices-import').click();
  await page.waitForURL(/\/az\/seller\/products\/import\?type=customer_prices&buyerId=/);
  await expect(page.getByTestId('import-kind-customer_prices')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.locator('#import-buyer')).toHaveValue(buyerId);
  await expect(page.locator('#import-buyer option:checked')).toHaveText(buyerName);

  // Müşteri seçilmeden şablon kapalı; seçilince bu müşteriye hazır şablon iner.
  await page.locator('#import-buyer').selectOption('');
  await expect(page.getByTestId('import-template')).toBeDisabled();
  await page.locator('#import-buyer').selectOption({ label: buyerName });
  await shot(page, '6-sihirbaz-musteri');
  const download = page.waitForEvent('download');
  await page.getByTestId('import-template').click();
  expect((await download).suggestedFilename()).toMatch(/\.xlsx$/);

  // Yükleme gerçek API ile iş açar; sonra yanıtlar taklit edilir.
  let mode: 'real' | 'error' | 'preview' = 'real';
  let canApply = false;
  await page.route(/\/api\/v1\/imports\/[0-9a-f-]{36}$/, async (route: Route) => {
    if (mode === 'real') {
      await route.continue();
      return;
    }
    if (mode === 'error') {
      await route.fulfill({ status: 500, json: { code: 'INTERNAL_ERROR', message: 'x' } });
      return;
    }
    const jobId = new URL(route.request().url()).pathname.split('/')[4] ?? '';
    const now = new Date().toISOString();
    await route.fulfill({
      status: 200,
      json: {
        id: jobId,
        type: 'customer_prices',
        buyerId,
        canApply,
        status: 'preview_ready',
        stats: { insert: 2, update: 1, error: 0, warning: 1 },
        notes: [],
        problems: [{ row: 4, sku: 'A-1', issues: [{ column: 'price', code: 'price_unchanged' }] }],
        failureCode: null,
        appliedUntilRow: null,
        errorReportUrl: '/api/v1/dev/storage/report.xlsx',
        resultReportUrl: null,
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        createdAt: now,
        updatedAt: now,
      },
    });
  });
  await page.getByTestId('import-file-input').setInputFiles({
    name: 'qiymetler.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: XLSX,
  });
  await page.waitForURL(/\/az\/seller\/products\/import\?job=[0-9a-f-]{36}$/);

  // #85: ilk yüklemede geçici hata "süresi doldu" değil, yeniden dene.
  mode = 'error';
  await page.reload();
  await expect(page.getByText('İdxal yüklənmədi')).toBeVisible();
  await shot(page, '7-gecici-hata');

  // #85: canApply false → "Təsdiqlə" baştan yok, neden yazılı.
  mode = 'preview';
  await page.getByRole('button', { name: 'Yenidən cəhd et' }).click();
  await expect(page.getByTestId('import-preview')).toBeVisible();
  await expect(page.getByTestId('import-stat-insert')).toContainText('Yeni qiymət');
  await expect(page.getByTestId('import-stat-warning')).toContainText('Dəyişməyən');
  await expect(page.getByTestId('import-not-allowed')).toContainText(/yalnız faylı yükləyən/);
  await expect(page.getByRole('button', { name: /Təsdiqlə və tətbiq et/ })).toHaveCount(0);
  await shot(page, '8-onay-yok');

  canApply = true;
  await page.reload();
  await expect(page.getByRole('button', { name: 'Təsdiqlə və tətbiq et (3)' })).toBeVisible();
  await expect(page.getByTestId('import-not-allowed')).toHaveCount(0);
});

test('F3.7b-K11 içe aktarma izni olmayan üye bilgi kartı görür; şablon ve yükleme yok (#85)', async ({
  page,
}) => {
  const rep = await createUser('az');
  const { businessId } = await addMembership(rep.id, 'seller_sales_rep', 'E2E Temsilçi Topdan');
  await addSubscription(businessId, 'pilot');
  await loginThroughUi(page, 'az', rep.phone);
  await page.waitForURL('**/az/seller');
  await page.goto('/az/seller/products/import?type=customer_prices');
  await expect(page.getByText('Excel idxalı üçün icazəniz yoxdur.')).toBeVisible();
  await expect(page.getByTestId('import-template')).toHaveCount(0);
  await expect(page.getByTestId('import-file-input')).toHaveCount(0);
  await shot(page, '9-izin-yok');
});
