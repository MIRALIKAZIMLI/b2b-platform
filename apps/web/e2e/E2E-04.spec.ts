// E2E-04 (web, F2.13b): satış temsilcisi perakendeciyi tam telefonla bulur → bağlantı isteği
// gönderir → perakendeci admini gelen isteği görür, veri paylaşım uyarısını onaylayıp kabul eder
// (US-020, US-021, US-023 AC1–AC2) → temsilcinin gönderilen isteği "Qəbul edildi" olur.
import { expect, type Page, test } from '@playwright/test';
import {
  addMembership,
  addSubscription,
  assignMembershipRegion,
  completeOtpLogin,
  createRegion,
  createUser,
  loginThroughUi,
  randomPhone,
} from './fixtures';

/** Perakendeci kendi kaydolur (E2E-03 akışı): dizin kartı için profil + gizlilik satırları açılır. */
async function registerBuyer(page: Page, phone: string, legalName: string, region: string) {
  await page.goto('/az/register');
  await completeOtpLogin(page, phone);
  await expect(page.getByRole('heading', { name: 'Müəssisənizi tanıdın' })).toBeVisible();
  await page.locator('input[name="fullName"]').fill('Leyla Əliyeva');
  await page.locator('input[name="legalName"]').fill(legalName);
  const activity = page.locator('select[name="activityTypeId"]');
  const firstActivity = await activity.locator('option').nth(1).getAttribute('value');
  await activity.selectOption(firstActivity ?? '');
  await page.locator('select[name="regionId"]').selectOption({ label: region });
  await page.locator('input[name="consent"]').check();
  await page.getByRole('button', { name: 'Hesabı yarat' }).click();
  await page.waitForURL('**/az/buyer');
}

test('E2E-04: temsilci telefonla bulur → istek → perakendeci kabul eder', async ({ browser }) => {
  const region = await createRegion();
  const buyerPhone = randomPhone();
  const buyerName = `E2E Market ${buyerPhone.slice(-5)}`;
  const sellerName = `E2E Topdan ${buyerPhone.slice(-5)}`;

  const buyerContext = await browser.newContext();
  const buyerPage = await buyerContext.newPage();
  await registerBuyer(buyerPage, buyerPhone, buyerName, region.name);

  // Temsilci: `assigned` kapsam, perakendecinin bölgesine atanmış; plan günlük istek hakkı verir.
  const rep = await createUser();
  const { businessId: sellerId } = await addMembership(rep.id, 'seller_sales_rep', sellerName);
  await addSubscription(sellerId, 'pilot');
  await assignMembershipRegion(rep.id, sellerId, region.id);

  const sellerContext = await browser.newContext();
  const sellerPage = await sellerContext.newPage();
  await loginThroughUi(sellerPage, 'az', rep.phone);
  await sellerPage.waitForURL('**/az/seller');

  // US-020: tam telefonla bulur; US-021: mesaj + önerilen vade ile istek.
  await sellerPage.goto('/az/seller/directory');
  await sellerPage.getByRole('tab', { name: 'Telefon və ya VÖEN ilə tap' }).click();
  await sellerPage.locator('#directory-exact').fill(buyerPhone);
  await sellerPage.getByRole('button', { name: 'Tap', exact: true }).click();
  await expect(sellerPage.getByText(buyerName)).toBeVisible();
  await sellerPage.getByRole('button', { name: 'Bağlantı sorğusu göndər' }).click();
  const sendDialog = sellerPage.getByRole('dialog');
  // Müfettiş 17 #59 L1: açılışta odak mesaj alanında.
  await expect(sendDialog.locator('#connection-message')).toBeFocused();
  await sendDialog.locator('#connection-message').fill('Salam, əməkdaşlıq təklif edirik.');
  await sendDialog.locator('#connection-term').fill('30');
  await sendDialog.getByRole('button', { name: 'Sorğunu göndər' }).click();
  await sendDialog.getByRole('link', { name: 'Sorğulara bax' }).click();
  await sellerPage.waitForURL('**/az/seller/requests');
  await expect(sellerPage.getByText(buyerName)).toBeVisible();
  await expect(sellerPage.getByText('Gözləyir').first()).toBeVisible();

  // US-023 AC1: perakendeci gelen isteği toptancı özetiyle görür (mesaj, vade); ürün/fiyat yok.
  await buyerPage.goto('/az/buyer/incoming-requests');
  const card = buyerPage.getByRole('article', { name: sellerName });
  await expect(card).toBeVisible();
  await expect(card.getByText('Salam, əməkdaşlıq təklif edirik.')).toBeVisible();
  await expect(card.getByText('30 gün')).toBeVisible();

  // US-023 AC2: kabul penceresi veri paylaşım uyarısını gösterir; onayla bağlantı kurulur.
  await card.getByRole('button', { name: 'Qəbul et' }).click();
  const acceptDialog = buyerPage.getByRole('dialog');
  await expect(
    acceptDialog.getByText('Bu topdançı çatdırılma və əlaqə məlumatlarınızı görəcək.'),
  ).toBeVisible();
  await acceptDialog.getByRole('button', { name: 'Razıyam, qəbul et' }).click();
  await expect(acceptDialog).toHaveCount(0);
  await expect(buyerPage.getByText('Gözləyən sorğu yoxdur')).toBeVisible();

  // Temsilcinin gönderilen isteği kabul edildi.
  await sellerPage.reload();
  await expect(sellerPage.getByText('Qəbul edildi').first()).toBeVisible();

  await buyerContext.close();
  await sellerContext.close();
});
