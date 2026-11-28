// F3.11b (web): depo stok ekranı (US-039 AC1, AC6, AC7; S1 = A, S2 = A, S5 = B). Toptancı depo ve iki
// ürün açar; stok ekranında ürünler "Sayılmayıb"; birine 2 koli mal girişi (= 48 ədəd), sonra sayımda
// toplam 40 yazılır (fark −8); "Az qalan" süzgecinde görünür; geçmişte iki hareket. Ayarlar > Stok'ta
// "Miqdar" seçilir: sayılmamış ürün olduğu için onay penceresi çıkar, onaylanınca açılır ve stok
// ekranındaki mod şeridi kaybolur. SHOTS verilirse ekran görüntüsü (yalnız yerel).
import { randomUUID } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';
import {
  addCasePackaging,
  addMembership,
  addSubscription,
  createUser,
  loginThroughUi,
} from './fixtures';

test.describe.configure({ timeout: 240_000 });

const SHOTS = process.env.SHOTS;

async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS !== undefined && SHOTS !== '') {
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
  }
}

async function newProduct(page: Page, code: string): Promise<void> {
  await page.goto('/az/seller/products/new');
  const form = page.getByTestId('product-form');
  await form.locator('input[name="sku"]').fill(code);
  await form.locator('input[name="name.az"]').fill(`Şampun ${code}`);
  await form.locator('#product-category').selectOption({ index: 1 });
  await form.locator('input[name="variants.0.sku"]').fill(`${code}-1`);
  await page.getByRole('button', { name: 'Qaralama kimi saxla' }).click();
  await page.waitForURL(/\/az\/seller\/products\/[0-9a-f-]{36}\?created=1$/);
}

test('F3.11b-AC1 F3.11b-AC7 F3.11b-AC6 F3.11b-MODE mal qəbulu, sayım, az qalan süzgəci və miqdar rejiminin açılması', async ({
  page,
}) => {
  const id = randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase();
  const sellerAdmin = await createUser('az');
  const { businessId: sellerId } = await addMembership(
    sellerAdmin.id,
    'seller_business_admin',
    `E2E Anbar Topdan ${id}`,
  );
  await addSubscription(sellerId, 'pilot');

  await loginThroughUi(page, 'az', sellerAdmin.phone);
  await page.waitForURL('**/az/seller');

  // Depo (Ayarlar > Anbarlar) ve iki ürün.
  await page.goto('/az/seller/settings');
  await page.getByRole('tab', { name: 'Anbarlar' }).click();
  await page.getByLabel('Anbarın adı').fill('Əsas anbar');
  await page.getByRole('button', { name: 'Anbar əlavə et' }).click();
  await expect(page.getByText('Əsas anbar').first()).toBeVisible();
  const counted = `STA-${id}`;
  const uncounted = `STB-${id}`;
  await newProduct(page, counted);
  await newProduct(page, uncounted);
  await addCasePackaging(sellerId, `${counted}-1`, '24');

  // Stok ekranı: mod şeridi, iki ürün "Sayılmayıb".
  await page.goto('/az/seller/stock');
  await expect(page.getByTestId('stock-mode-banner')).toBeVisible();
  const row = page.getByTestId(`stock-row-${counted}-1`);
  await expect(row).toContainText('Sayılmayıb');
  await expect(page.getByTestId(`stock-row-${uncounted}-1`)).toContainText('Sayılmayıb');
  await shot(page, '1-sayilmayib-az');

  // Mal girişi: 2 koli = 48 ədəd.
  await row.getByTestId(`stock-receipt-${counted}-1`).click();
  const receipt = page.getByTestId('stock-dialog-receipt');
  await receipt.getByLabel('Gələn miqdar').fill('2');
  await expect(receipt.getByTestId('stock-dialog-base')).toContainText('48');
  await receipt.getByLabel('Partiya nömrəsi').fill('LOT-1');
  await shot(page, '2-mal-qebulu-az');
  await receipt.getByTestId('stock-dialog-submit').click();
  await expect(page.getByRole('status').filter({ hasText: 'qəbul yazıldı' })).toBeVisible();
  await expect(page.getByTestId(`stock-on-hand-${counted}-1`)).toContainText('48');

  // Sayım: toplam 40 ədəd (temel birim seçilir), fark −8.
  await row.getByTestId(`stock-count-${counted}-1`).click();
  const count = page.getByTestId('stock-dialog-adjustment');
  await count.getByLabel('Vahid').selectOption('base');
  await count.getByLabel('Rəfdə saydığınız ümumi miqdar').fill('40');
  await expect(count.getByTestId('stock-dialog-delta')).toContainText('−8');
  await shot(page, '3-sayim-az');
  await count.getByTestId('stock-dialog-submit').click();
  await expect(page.getByRole('status').filter({ hasText: 'sayım yazıldı' })).toBeVisible();
  await expect(page.getByTestId(`stock-on-hand-${counted}-1`)).toContainText('40');

  // Az qalan: eşik 5 koli = 120 ədəd; 40 ədəd az qalandır, sayılmamış ürün görünmez.
  await page.getByTestId('stock-filter-low').click();
  await expect(page.getByTestId('stock-filter-low')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId(`stock-row-${counted}-1`)).toContainText('Az qalıb');
  await expect(page.getByTestId(`stock-row-${uncounted}-1`)).toHaveCount(0);
  await shot(page, '4-az-qalan-az');

  // Tarixçə: iki hareket, partiya görünür.
  await page.getByTestId(`stock-row-${counted}-1`).getByRole('button', { name: 'Tarixçə' }).click();
  const history = page.getByTestId('stock-history');
  await expect(history.locator('li')).toHaveCount(2);
  await expect(history).toContainText('partiya LOT-1');
  await shot(page, '5-tarixce-az');
  await history.getByRole('button', { name: 'Bağla' }).click();

  // Miqdar rejimi: sayılmamış ürün → onay penceresi → açılır.
  await page.goto('/az/seller/settings?tab=stock');
  await page.getByTestId('stock-mode-quantity').locator('input').check();
  await page.getByRole('button', { name: 'Yadda saxla' }).click();
  const confirm = page.getByTestId('stock-uncounted-confirm');
  await expect(confirm).toContainText('1 məhsulun');
  await shot(page, '6-tesdiq-az');
  await confirm.getByTestId('stock-uncounted-confirm-submit').click();
  await expect(page.getByRole('status')).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: 'Stok' }).click();
  await expect(page.getByTestId('stock-mode-quantity').locator('input')).toBeChecked();

  await page.goto('/az/seller/stock');
  await expect(page.getByTestId(`stock-row-${counted}-1`)).toBeVisible();
  await expect(page.getByTestId('stock-mode-banner')).toHaveCount(0);

  // Dar ekran.
  await page.setViewportSize({ width: 390, height: 844 });
  await shot(page, '7-dar-ekran-az');
});
