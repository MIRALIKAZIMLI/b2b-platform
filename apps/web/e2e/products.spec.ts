// F3.3b (web): toptancı ürün listesi ve formu (US-030). Toptancı admini "Məhsullar"ı açar, boş
// formda alan hatalarını görür (AC2), formdan marka talep eder (AC6), koli seviyesi ekler ve kural
// ihlalini (koli ≤ adet) alanda görür (AC3), taslak kaydeder; onay bekleyen markada yayın kapalıdır,
// marka onaylanınca yayınlar, arşivler (salt okunur) ve taslağa geri alır (AC5); listede arar (AC1).
import { randomUUID } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';
import {
  addMembership,
  addSubscription,
  approveBrandRequest,
  createUser,
  loginThroughUi,
} from './fixtures';

test.describe.configure({ timeout: 120_000 });

const menu = (page: Page) => page.getByRole('navigation', { name: 'Menyu' });
const suffix = () => randomUUID().replaceAll('-', '').slice(0, 8);

test('F3.3b-AC1 F3.3b-AC2 F3.3b-AC3 F3.3b-AC5 F3.3b-AC6 ürün yaradılır, dərc edilir, arxivlənir', async ({
  page,
}) => {
  const admin = await createUser('az');
  const { businessId } = await addMembership(
    admin.id,
    'seller_business_admin',
    'E2E Məhsul Topdan',
  );
  await addSubscription(businessId, 'pilot');
  const id = suffix();
  const sku = `E2E-${id}`;
  const brandName = `E2E Brend ${id}`;

  await loginThroughUi(page, 'az', admin.phone);
  await page.waitForURL('**/az/seller');
  await menu(page).getByRole('link', { name: 'Məhsullar' }).click();
  await page.waitForURL('**/az/seller/products');
  await expect(page.getByText('Hələ məhsul yoxdur.')).toBeVisible();

  // AC2: boş form → alan xətaları.
  await page.getByRole('link', { name: 'Yeni məhsul' }).click();
  await page.waitForURL('**/az/seller/products/new');
  const form = page.getByTestId('product-form');
  await page.getByRole('button', { name: 'Qaralama kimi saxla' }).click();
  await expect(page.getByText('Qeyd olunan sahələri düzəldin.')).toBeVisible();
  await expect(form.locator('[aria-invalid="true"]')).toHaveCount(4);

  // Əsas məlumat və təsnifat.
  await form.locator('input[name="sku"]').fill(sku);
  await form.locator('input[name="name.az"]').fill(`Süd ${id}`);
  await page.getByTestId('lang-tab-ru').click();
  await form.locator('input[name="name.ru"]').fill(`Молоко ${id}`);
  await form.locator('#product-category').selectOption({ index: 1 });

  // AC6: brend siyahıda yoxdur → sorğu; sorğu dərhal seçilir (təsdiq gözləyir).
  await page.getByRole('button', { name: 'Brend seç' }).click();
  await page.locator('#brand-search').fill(brandName);
  await page.getByRole('button', { name: `«${brandName}» üçün sorğu göndər` }).click();
  await expect(page.getByTestId('brand-selected')).toContainText(brandName);
  await expect(page.getByTestId('brand-selected')).toContainText('Təsdiq gözləyir');

  // AC3: variant + qutu səviyyəsi; qutu ≤ ədəd → server xətası sahədə.
  await form.locator('input[name="variants.0.sku"]').fill(`${sku}-1L`);
  await page.getByRole('button', { name: 'Qutu əlavə et' }).click();
  await expect(page.getByRole('button', { name: 'Qutu əlavə et' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Daxili paket əlavə et' })).toBeVisible();
  const caseRow = page.locator('[data-testid="packaging-row"][data-level="case"]');
  await caseRow.locator('input[name="variants.0.packaging.1.baseQty"]').fill('1');
  await page.getByRole('button', { name: 'Qaralama kimi saxla' }).click();
  await expect(
    caseRow.getByText('Böyük səviyyə əvvəlkindən çox əsas vahid saxlamalıdır.'),
  ).toBeVisible();
  await caseRow.locator('input[name="variants.0.packaging.1.baseQty"]').fill('12');
  await caseRow.getByText('Satış vahidi').click();
  await caseRow.locator('input[name="variants.0.packaging.1.minOrderQty"]').fill('2');
  await caseRow.locator('input[name="variants.0.packaging.1.orderMultiple"]').fill('2');
  await page.getByRole('button', { name: 'Qaralama kimi saxla' }).click();
  await page.waitForURL(/\/az\/seller\/products\/[0-9a-f-]{36}\?created=1$/);
  await expect(page.getByText('Qaralama yaradıldı.')).toBeVisible();

  // AC5: təsdiq gözləyən brenddə dərc bağlıdır.
  const publish = page.getByRole('button', { name: 'Dərc et' });
  await expect(publish).toBeDisabled();
  await expect(page.getByText('Dərc üçün brendin təsdiqi gözlənilir.')).toBeVisible();

  await approveBrandRequest(brandName);
  await page.reload();
  await expect(publish).toBeEnabled();
  await publish.click();
  await expect(page.getByText('Məhsul dərc edildi.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Dərc et' })).toHaveCount(0);

  // Arxiv → oxumaq üçün; qaralamaya qaytar.
  await page.getByRole('button', { name: 'Arxivlə' }).click();
  await expect(page.getByText('Məhsul arxivləndi.')).toBeVisible();
  await expect(
    page.getByText('Məhsul arxivdədir və redaktə olunmur.', { exact: false }),
  ).toBeVisible();
  await expect(form.locator('input[name="sku"]')).toBeDisabled();
  await page.getByRole('button', { name: 'Qaralamaya qaytar' }).click();
  await expect(page.getByText('Məhsul qaralamaya qaytarıldı.')).toBeVisible();
  await expect(form.locator('input[name="sku"]')).toBeEnabled();

  // AC1: siyahı, axtarış və status sekmələri.
  await page.getByRole('link', { name: '← Məhsullar' }).click();
  await page.waitForURL('**/az/seller/products');
  const row = page.getByTestId('product-row').filter({ hasText: sku });
  await expect(row).toContainText(`Süd ${id}`);
  await expect(row).toContainText('Qaralama');
  await expect(row).toContainText(brandName);
  await page.getByTestId('product-tab-active').click();
  await expect(page.getByText('Satışda olan məhsul yoxdur.')).toBeVisible();
  await page.getByTestId('product-tab-all').click();
  await page.locator('#product-search').fill('yoxdur-belə-məhsul');
  await expect(page.getByText('Axtarışa uyğun məhsul tapılmadı.')).toBeVisible();
  await page.locator('#product-search').fill(sku);
  await expect(page.getByTestId('product-row')).toHaveCount(1);
});
