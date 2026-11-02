// F2.7b (web): ekip yönetimi uçtan uca (US-013 AC1, AC3, AC5). Toptancı admini ekip ekranından
// satış temsilcisini davet eder (unvan seçilince rol şablondan gelir), davetli SMS bağlantısıyla
// girer ve seller alanına düşer (menüde "Komanda" yok); admin listede üyeyi görür, kendini
// çıkaramaz (tek admin), üyeyi onaylı adımla çıkarır.
import { expect, type Page, test } from '@playwright/test';
import {
  addMembership,
  addSubscription,
  completeOtpLogin,
  createUser,
  latestActivationPath,
  loginThroughUi,
  randomPhone,
} from './fixtures';

const menu = (page: Page) => page.getByRole('navigation', { name: 'Menyu' });

test('US-013 AC1 davet → SMS bağlantısıyla kabul → üye listede; AC3 tek admin; AC5 menü', async ({
  page,
  browser,
}) => {
  const admin = await createUser('az');
  const { businessId } = await addMembership(admin.id, 'seller_business_admin', 'E2E Ekip Topdan');
  await addSubscription(businessId, 'pilot');

  await loginThroughUi(page, 'az', admin.phone);
  await page.waitForURL('**/az/seller');
  await menu(page).getByRole('link', { name: 'Komanda' }).click();
  await page.waitForURL('**/az/seller/team');
  await expect(page.getByRole('heading', { level: 1, name: 'Komanda' })).toBeVisible();
  await expect(page.getByTestId('member-row')).toHaveCount(1);
  await expect(page.getByTestId('member-row')).toContainText('Siz');

  // AC1: unvan seçilince rol şablondan önerilir; gönderim → açık davetlerde görünür.
  const phone = randomPhone();
  await page.getByRole('button', { name: 'Dəvət et' }).click();
  const form = page.getByTestId('invite-form');
  await form.getByRole('button', { name: 'Dəvət göndər' }).click();
  await expect(form.locator('[aria-invalid="true"]')).toHaveCount(4);
  await form.locator('input[name="phone"]').fill(phone);
  await form.locator('input[name="fullName"]').fill('Rauf Nümayəndə');
  await form.locator('select[name="jobTitleId"]').selectOption({ label: 'Satış nümayəndəsi' });
  await expect(form.locator('select[name="roleId"] option:checked')).toHaveText(
    'Satış nümayəndəsi',
  );
  await form.getByRole('button', { name: 'Dəvət göndər' }).click();
  await expect(page.getByText('Dəvət göndərildi.')).toBeVisible();
  await expect(page.getByTestId('invitation-row')).toHaveCount(1);
  await expect(page.getByTestId('invitation-row')).toContainText(phone);

  // Davetli: SMS bağlantısı → giriş → seller alanı; team.manage yok → menüde "Komanda" yok.
  const path = await latestActivationPath(page.request, phone);
  const invitee = await (await browser.newContext()).newPage();
  await invitee.goto(path);
  await expect(invitee.getByText('dəvət göndərilən telefon nömrəsi ilə daxil olun')).toBeVisible();
  await completeOtpLogin(invitee, phone);
  await invitee.waitForURL('**/az/seller');
  await expect(invitee.getByRole('combobox', { name: 'Biznes' })).toContainText('E2E Ekip Topdan');
  await expect(menu(invitee).getByText('Komanda')).toHaveCount(0);

  // Admin: üye listede, bölge atanmadı uyarısı; açık davet kalmadı.
  await page.reload();
  const rep = page.getByTestId('member-row').filter({ hasText: 'Rauf Nümayəndə' });
  await expect(page.getByTestId('member-row')).toHaveCount(2);
  await expect(rep).toContainText('Bölgə təyin edilməyib');
  await expect(page.getByText('Açıq dəvət yoxdur')).toBeVisible();

  // AC3: tek admin kendini çıkaramaz.
  const self = page.getByTestId('member-row').filter({ hasText: 'Siz' });
  await self.getByRole('button', { name: 'Komandadan çıxar' }).click();
  await self.getByRole('button', { name: 'Bəli, çıxar' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Müəssisənin yeganə adminini silmək və ya rolunu dəyişmək olmaz.',
  );
  await expect(page.getByTestId('member-row')).toHaveCount(2);

  // Üyeyi onaylı adımla çıkarır.
  await rep.getByRole('button', { name: 'Komandadan çıxar' }).click();
  await rep.getByRole('button', { name: 'Bəli, çıxar' }).click();
  await expect(page.getByText('Rauf Nümayəndə komandadan çıxarıldı.')).toBeVisible();
  await expect(page.getByTestId('member-row')).toHaveCount(1);
});
