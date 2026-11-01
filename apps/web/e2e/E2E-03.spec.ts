// E2E-03 (web, F2.3b): perakendeci kendi kaydolur (US-005 AC1–AC4, SF-02, NFR-63). Telefon SMS
// koduyla doğrulanır, işletme formu + veri paylaşım onayı → oturum açılır, perakendeci alanında
// "Profilinizi tamamlayın" kartı ve boş durum görünür. Senaryonun "VÖEN girer" adımı F2.4'te eklenir.
import { expect, test } from '@playwright/test';
import { addMembership, completeOtpLogin, createRegion, createUser, randomPhone } from './fixtures';

test('E2E-03: perakendeci kaydolur → perakendeci alanı, profil doluluğu %40', async ({ page }) => {
  const region = await createRegion();
  await page.goto('/az/login');
  await page.getByTestId('buyer-register-link').click();
  await page.waitForURL('**/az/register');

  await completeOtpLogin(page, randomPhone());
  await expect(page.getByRole('heading', { name: 'Müəssisənizi tanıdın' })).toBeVisible();

  // US-005-AC3: zorunlu alan boşsa kayıt tamamlanmaz, alanlar işaretlenir.
  await page.getByRole('button', { name: 'Hesabı yarat' }).click();
  await expect(page.locator('[aria-invalid="true"]')).toHaveCount(5);
  await expect(page.getByText('Davam etmək üçün mətni təsdiqləyin.')).toBeVisible();
  await expect(page).toHaveURL(/\/az\/register$/);

  await page.locator('input[name="fullName"]').fill('Leyla Əliyeva');
  await page.locator('input[name="legalName"]').fill('Leyla Market E2E');
  const activity = page.locator('select[name="activityTypeId"]');
  const firstActivity = await activity.locator('option').nth(1).getAttribute('value');
  await activity.selectOption(firstActivity ?? '');
  await page.locator('select[name="regionId"]').selectOption({ label: region.name });

  // NFR-63: metin yerinde açılır, sürüm görünür; onay kutusu işaretlenir.
  await page.getByRole('button', { name: 'Məlumat paylaşımı mətnini oxuyun' }).click();
  await expect(page.getByText('Məlumatlarınızın paylaşılması haqqında')).toBeVisible();
  await expect(page.getByText('Mətn versiyası: v1')).toBeVisible();
  await page.locator('input[name="consent"]').check();

  // US-005-AC1, AC2: oturum açılır, perakendeci alanı; toptancı/ürün yok, profil kartı yüzdeyle.
  await page.getByRole('button', { name: 'Hesabı yarat' }).click();
  await page.waitForURL('**/az/buyer');
  await expect(page.getByTestId('profile-completion')).toContainText('Profilinizi tamamlayın');
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
  await expect(page.getByText('Hələ bağlı topdansatışçınız yoxdur')).toBeVisible();
});

test('US-005-AC4: kayıtlı numara kayıt sayfasında yeni işletme açmaz, mevcut üyeliğine girer', async ({
  page,
}) => {
  const user = await createUser();
  await addMembership(user.id, 'buyer_business_admin', 'E2E Mövcud Mağaza');
  await page.goto('/az/register');
  await completeOtpLogin(page, user.phone);
  await page.waitForURL('**/az/buyer');
  await expect(page.getByRole('combobox', { name: 'Biznes' })).toContainText('E2E Mövcud Mağaza');
  await expect(page.getByRole('heading', { name: 'Müəssisənizi tanıdın' })).toHaveCount(0);
});
