// E2E-09 (web, F2.15b, kısmi): toptancı admini müşteri bağlantısını gerekçe + ikinci onayla iptal
// eder (US-025 AC1) → perakendecinin "Topdançılarım" ekranında bağlantı "Ləğv edilib", iptal eden
// "Qarşı tərəf" (gerekçe görünmez, K2 = A), yeniden bağlan / iptal düğmesi yok (US-025 AC6).
// Ürünlerin kaybolması ve sepetin temizlenmesi F3/F4'te (ConnectionCancelledHandler, F4.5).
import { expect, test } from '@playwright/test';
import {
  addMembership,
  addSubscription,
  createActiveConnection,
  createUser,
  loginThroughUi,
} from './fixtures';

test('E2E-09 (kısmi): toptancı bağlantıyı iptal eder → perakendecide ləğv edilib', async ({
  browser,
}) => {
  const sellerAdmin = await createUser();
  const buyerAdmin = await createUser();
  const suffix = sellerAdmin.phone.slice(-5);
  const sellerName = `E2E Topdan ${suffix}`;
  const buyerName = `E2E Market ${suffix}`;
  const { businessId: sellerId } = await addMembership(
    sellerAdmin.id,
    'seller_business_admin',
    sellerName,
  );
  const { businessId: buyerId } = await addMembership(
    buyerAdmin.id,
    'buyer_business_admin',
    buyerName,
  );
  await addSubscription(sellerId, 'pilot');
  await addSubscription(buyerId, 'buyer_free');
  await createActiveConnection(sellerId, buyerId, sellerAdmin.id, buyerAdmin.id);

  const sellerContext = await browser.newContext();
  const sellerPage = await sellerContext.newPage();
  await loginThroughUi(sellerPage, 'az', sellerAdmin.phone);
  await sellerPage.waitForURL('**/az/seller');
  await sellerPage.goto('/az/seller/customers');
  const row = sellerPage.getByRole('listitem').filter({ hasText: buyerName });
  await expect(row).toBeVisible();

  // US-025 AC1: gerekçe ve ikinci onay olmadan "Ləğv et" kapalı.
  await row.getByRole('button', { name: 'Əlaqəni ləğv et' }).click();
  const dialog = sellerPage.getByRole('alertdialog');
  await expect(
    dialog.getByRole('heading', { name: `${buyerName} ilə əlaqə ləğv edilsin?` }),
  ).toBeVisible();
  const submit = dialog.getByRole('button', { name: 'Ləğv et', exact: true });
  await expect(submit).toBeDisabled();
  await dialog.getByLabel('Ödəniş problemi').check();
  await expect(submit).toBeDisabled();
  await dialog.locator('#cancel-note').fill('Ödənişlər gecikir');
  await dialog.getByRole('checkbox').check();
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(dialog).toHaveCount(0);
  await expect(sellerPage.getByText(buyerName)).toHaveCount(0);

  await sellerPage.getByRole('tab', { name: 'Ləğv edilib' }).click();
  const cancelledRow = sellerPage.getByRole('listitem').filter({ hasText: buyerName });
  await expect(cancelledRow.getByText('Siz ləğv etmisiniz')).toBeVisible();
  await expect(cancelledRow.getByRole('button')).toHaveCount(0);

  // US-025 AC6: perakendeci iptali görür; gerekçe ve "yeniden bağlan" yok.
  const buyerContext = await browser.newContext();
  const buyerPage = await buyerContext.newPage();
  await loginThroughUi(buyerPage, 'az', buyerAdmin.phone);
  await buyerPage.waitForURL('**/az/buyer');
  await buyerPage.goto('/az/buyer/suppliers');
  await expect(buyerPage.getByRole('heading', { name: 'Topdançılarım' })).toBeVisible();
  await expect(buyerPage.getByText('Hələ topdançı yoxdur')).toBeVisible();
  await buyerPage.getByRole('tab', { name: 'Ləğv edilib' }).click();
  const supplierRow = buyerPage.getByRole('listitem').filter({ hasText: sellerName });
  await expect(supplierRow.getByText('Qarşı tərəf ləğv edib')).toBeVisible();
  await expect(supplierRow.getByText('Ödəniş problemi')).toHaveCount(0);
  await expect(supplierRow.getByRole('button')).toHaveCount(0);
  await expect(buyerPage.getByRole('button', { name: /bağlan|sorğu/i })).toHaveCount(0);

  await sellerContext.close();
  await buyerContext.close();
});
