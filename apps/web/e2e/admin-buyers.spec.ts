// F2.18b (web): admin "Perakendeciler" ekranı (US-015, US-016). Operasyon ekibi VÖEN kuyruğunda
// kaydı açar, e-taxes bağlantısını görür, doğrular ve gerekçe koduyla reddeder (US-015 AC1–AC2);
// askıya alır, geri açar ve siler: geçmişsiz kayıt kalıcı silinir, bağlantılı kayıt arşivlenir
// (US-016 AC1–AC3). Destek yalnız görür.
import { randomUUID } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';
import {
  addMembership,
  createActiveConnection,
  createPlatformStaff,
  createUser,
  loginPlatformThroughUi,
  randomVoen,
  setBusinessVoen,
} from './fixtures';

// Platform girişi TOTP kurulumunu da içerir.
test.describe.configure({ timeout: 120_000 });

const menu = (page: Page) => page.getByRole('navigation', { name: 'Menyu' });
const row = (page: Page, id: string) => page.locator(`[data-testid="buyer-row"][data-id="${id}"]`);
const dialog = (page: Page) => page.getByRole('dialog').or(page.getByRole('alertdialog'));

async function buyer(name: string, voen = true): Promise<{ id: string; userId: string }> {
  const user = await createUser();
  const { businessId } = await addMembership(user.id, 'buyer_business_admin', name);
  if (voen) await setBusinessVoen(businessId, randomVoen());
  return { id: businessId, userId: user.id };
}

async function openBuyers(page: Page, role: string): Promise<void> {
  const staff = await createPlatformStaff(role);
  await loginPlatformThroughUi(page, 'az', staff.phone);
  await menu(page).getByRole('link', { name: 'Pərakəndəçilər' }).click();
  await page.waitForURL('**/az/admin/buyers');
}

async function statusAction(page: Page, open: string, submit: string, reason: string) {
  await dialog(page).getByRole('button', { name: open, exact: true }).click();
  const form = page.getByTestId('status-form');
  const button = form.getByRole('button', { name: submit });
  await expect(button).toBeDisabled();
  await form.locator('textarea[name="reason"]').fill(reason);
  await expect(button).toBeDisabled();
  await form.getByRole('checkbox').check();
  await button.click();
}

test('US-015 AC1–AC2 VÖEN növbəsi: qeyd, e-taxes, təsdiq və səbəblə rədd', async ({ page }) => {
  const suffix = randomUUID().slice(0, 6);
  const verifyMe = await buyer(`E2E Təsdiq ${suffix}`);
  const rejectMe = await buyer(`E2E Rədd ${suffix}`);
  await openBuyers(page, 'operations');

  await page.getByRole('tab', { name: 'VÖEN yoxlaması' }).click();
  await expect(row(page, verifyMe.id)).toContainText('VÖEN yoxlanılır');
  await row(page, verifyMe.id).getByRole('button', { name: 'Aç' }).click();
  // AC1: ünvan, VÖEN, hukuki tip, e-taxes bağlantısı.
  await expect(dialog(page)).toContainText(`E2E Təsdiq ${suffix}`);
  await expect(dialog(page)).toContainText('Hüquqi şəxs');
  await expect(
    dialog(page).getByRole('link', { name: /e-taxes\.gov\.az-da yoxla/ }),
  ).toHaveAttribute('href', /e-taxes\.gov\.az/);
  // AC2: doğrula.
  await dialog(page).getByRole('button', { name: 'Təsdiqlə' }).click();
  await expect(dialog(page).getByText('VÖEN təsdiqləndi.')).toBeVisible();
  await expect(dialog(page)).toContainText('VÖEN təsdiqlənib');
  await dialog(page).getByRole('button', { name: 'Bağla' }).click();
  await expect(row(page, verifyMe.id)).toHaveCount(0);

  // AC2: reddet (gerekçe kodu zorunlu).
  await row(page, rejectMe.id).getByRole('button', { name: 'Aç' }).click();
  await dialog(page).getByRole('button', { name: 'Rədd et' }).click();
  const form = page.getByTestId('reject-form');
  const submit = form.getByRole('button', { name: 'VÖEN-i rədd et' });
  await expect(submit).toBeDisabled();
  await form.getByLabel('Ad uyğun gəlmir').check();
  await submit.click();
  await expect(dialog(page)).toContainText('VÖEN yoxdur');
  await dialog(page).getByRole('button', { name: 'Bağla' }).click();
  await expect(row(page, rejectMe.id)).toHaveCount(0);
});

test('US-016 AC1–AC3 dayandır, bərpa et, sil (tarixçəsiz həmişəlik, əlaqəli arxiv)', async ({
  page,
}) => {
  const suffix = randomUUID().slice(0, 6);
  const target = await buyer(`E2E Dayandır ${suffix}`, false);
  const fresh = await buyer(`E2E Sil ${suffix}`, false);
  const linked = await buyer(`E2E Arxiv ${suffix}`, false);
  const sellerUser = await createUser();
  const seller = await addMembership(
    sellerUser.id,
    'seller_business_admin',
    `E2E Topdan ${suffix}`,
  );
  await createActiveConnection(seller.businessId, linked.id, sellerUser.id, linked.userId);
  await openBuyers(page, 'operations');

  // AC1: askıya al (iki adım) → "Dayandırılıb" sekmesinde; geri aç.
  await row(page, target.id).getByRole('button', { name: 'Aç' }).click();
  await statusAction(page, 'Dayandır', 'Dayandır', 'Şikayət yoxlanılır');
  await expect(page.getByRole('status').filter({ hasText: 'dayandırıldı' })).toBeVisible();
  await page.getByRole('tab', { name: 'Dayandırılıb' }).click();
  await row(page, target.id).getByRole('button', { name: 'Aç' }).click();
  await statusAction(page, 'Dayandırmanı götür', 'Bərpa et', 'Yoxlama bitdi');
  await expect(page.getByRole('status').filter({ hasText: 'bərpa edildi' })).toBeVisible();
  await expect(row(page, target.id)).toHaveCount(0);

  // AC3: geçmişsiz kayıt kalıcı silinir.
  await page.getByRole('tab', { name: 'Hamısı' }).click();
  await row(page, fresh.id).getByRole('button', { name: 'Aç' }).click();
  await statusAction(page, 'Sil', 'Həmişəlik sil', 'Mükərrər hesab');
  await expect(page.getByRole('status').filter({ hasText: 'həmişəlik silindi' })).toBeVisible();
  await expect(row(page, fresh.id)).toHaveCount(0);

  // AC2: bağlantılı kayıt arşivlenir.
  await row(page, linked.id).getByRole('button', { name: 'Aç' }).click();
  await statusAction(page, 'Sil', 'Həmişəlik sil', 'Mükərrər hesab');
  await expect(page.getByRole('status').filter({ hasText: 'arxivləndi' })).toBeVisible();
  await expect(row(page, linked.id)).toHaveCount(0);
});

test('F2.18b dəstək komandası yalnız baxır: əməliyyat düymələri yoxdur', async ({ page }) => {
  const target = await buyer(`E2E Baxış ${randomUUID().slice(0, 6)}`);
  await openBuyers(page, 'support');
  await row(page, target.id).getByRole('button', { name: 'Aç' }).click();
  await expect(dialog(page)).toContainText('yalnız baxmaq hüququnuz var');
  await expect(dialog(page).getByRole('button', { name: 'Təsdiqlə' })).toHaveCount(0);
  await expect(dialog(page).getByRole('button', { name: 'Dayandır' })).toHaveCount(0);
  await expect(dialog(page).getByRole('button', { name: 'Sil' })).toHaveCount(0);
});
