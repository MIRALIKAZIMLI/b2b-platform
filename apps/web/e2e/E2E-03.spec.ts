// E2E-03 (web, F2.3b): perakendeci kendi kaydolur (US-005 AC1–AC4, SF-02, NFR-63). Telefon SMS
// koduyla doğrulanır, işletme formu + veri paylaşım onayı → oturum açılır, perakendeci alanında
// "Profilinizi tamamlayın" kartı ve boş durum görünür. F2.4: karttan profile geçer, VÖEN girer
// (US-006 AC1 geçersiz → mesaj; AC2 geçerli → hukuki tip, "doğrulama bekliyor", doluluk %50).
// F2.10a: aynı sayfada görünürlük ayarları (US-007 AC1 varsayılan, AC2 alan açma, AC3 kilitli).
import { expect, test } from '@playwright/test';
import { addMembership, completeOtpLogin, createRegion, createUser, randomPhone } from './fixtures';

test('E2E-03: perakendeci kaydolur → VÖEN girer (profil %40 → %50)', async ({ page }) => {
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

  // F2.4: VÖEN girer. US-006-AC1: geçersiz VÖEN reddedilir, mesaj alanın altında.
  await page.getByTestId('profile-completion-link').click();
  await page.waitForURL('**/az/buyer/profile');
  await expect(page.getByTestId('voen-status')).toHaveText('VÖEN daxil edilməyib');
  const voen = page.locator('input[name="voen"]');
  await voen.fill('1234567893');
  await page.getByRole('button', { name: 'Yadda saxla' }).click();
  await expect(page.getByText('VÖEN yanlışdır.')).toBeVisible();
  await expect(voen).toHaveAttribute('aria-invalid', 'true');

  // US-006-AC2: geçerli VÖEN → hukuki tip son haneden, "doğrulama bekliyor".
  const valid = `${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}2`;
  await voen.fill(valid);
  await expect(page.getByTestId('voen-legal-type')).toHaveText('Fərdi sahibkar');
  await page.getByRole('button', { name: 'Yadda saxla' }).click();
  await expect(page.getByText('Yadda saxlanıldı')).toBeVisible();
  await expect(page.getByTestId('voen-status')).toHaveText('Təsdiq gözləyir');

  // US-007-AC1: yeni kayıtta yalnız "kataloqda görün" açık; AC3: üç alan kilitli, anahtarı yok.
  const listed = page.getByTestId('privacy-listedInDirectory');
  const showVoen = page.getByTestId('privacy-showVoen');
  await expect(listed).toHaveAttribute('aria-checked', 'true');
  await expect(showVoen).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('privacy-always-legalName')).toContainText('Həmişə açıq');
  await expect(page.getByRole('switch', { name: 'Ünvan', exact: true })).toHaveCount(0);
  // US-007-AC2: VÖEN görünür yapılır; kayıt yenilemeden sonra da açık.
  await showVoen.click();
  await page.getByTestId('privacy-save').click();
  await expect(page.getByText('Görünmə ayarları saxlanıldı.')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('privacy-showVoen')).toHaveAttribute('aria-checked', 'true');

  await page.goto('/az/buyer');
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
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
