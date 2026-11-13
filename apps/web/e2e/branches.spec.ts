// F2.5b (web): şube ekranı uçtan uca (US-010 AC1, AC3, AC4). Perakendeci admini menüden "Filiallar"a
// girer, kural seçmeden ilk şubeyi açar (every_order), ikinci şubeyi eşikli kuralla açar (eşiksiz
// gönderim alan hatası verir), ikinciyi pasifleştirir; son aktif şube pasifleşemez (409 mesajı).
// Silme düğmesi yoktur. Ekip ekranında davet formunda şube seçimi yalnız aktif şubeleri listeler.
import { expect, type Page, test } from '@playwright/test';
import {
  addMembership,
  addRoleFromTemplate,
  addSubscription,
  createRegion,
  createUser,
  loginThroughUi,
} from './fixtures';

const menu = (page: Page) => page.getByRole('navigation', { name: 'Menyu' });

test('US-010 AC1 şube oluşur ve listede döner; AC3 every_order; AC4 pasifleştirme, son aktif 409', async ({
  page,
}) => {
  const admin = await createUser('az');
  const { businessId } = await addMembership(admin.id, 'buyer_business_admin', 'E2E Filial Market');
  await addSubscription(businessId, 'buyer_free');
  await addRoleFromTemplate(businessId, 'buyer_branch_admin');
  const region = await createRegion();

  await loginThroughUi(page, 'az', admin.phone);
  await page.waitForURL('**/az/buyer');
  await menu(page).getByRole('link', { name: 'Filiallar' }).click();
  await page.waitForURL('**/az/buyer/branches');
  await expect(page.getByRole('heading', { level: 1, name: 'Filiallar' })).toBeVisible();
  await expect(page.getByText('Hələ filial yoxdur')).toBeVisible();

  // AC1 + AC3: boş gönderim alan hataları; kural seçilmeden açılan şube "Hər sifariş".
  await page.getByRole('button', { name: 'Yeni filial' }).click();
  await page.getByRole('button', { name: 'Filial əlavə et' }).click();
  await expect(page.locator('[aria-invalid="true"]')).toHaveCount(3);
  await page.getByLabel('Filialın adı').fill('Mərkəz filialı');
  await page.getByLabel('Region').selectOption({ label: region.name });
  await page.getByLabel('Ünvan').fill('Nizami küç. 10');
  await page.getByRole('button', { name: 'Filial əlavə et' }).click();
  await expect(page.getByText('Yadda saxlanıldı.')).toBeVisible();
  const rows = page.getByTestId('branch-row');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Mərkəz filialı');
  await expect(rows.first()).toContainText('Hər sifariş təsdiqlənir');

  // AC1: "Məbləğdən yuxarı" eşiksiz gönderilemez; eşik + konumla açılır.
  await page.getByRole('button', { name: 'Yeni filial' }).click();
  await page.getByLabel('Filialın adı').fill('Gənclik filialı');
  await page.getByLabel('Region').selectOption({ label: region.name });
  await page.getByLabel('Ünvan').fill('Atatürk pr. 5');
  await page.getByText('Məbləğdən yuxarı').click();
  await page.getByRole('button', { name: 'Filial əlavə et' }).click();
  await expect(page.getByText('Bu sahə mütləqdir.')).toBeVisible();
  await page.getByLabel('Təsdiqsiz maksimum məbləğ').fill('500');
  await page.getByLabel('Enlik').fill('40.409264');
  await page.getByLabel('Uzunluq').fill('49.867092');
  await page.getByRole('button', { name: 'Filial əlavə et' }).click();
  await expect(rows).toHaveCount(2);
  const second = rows.filter({ hasText: 'Gənclik filialı' });
  await expect(second).toContainText('500');
  await expect(second).toContainText('40.409264');

  // AC4: silme yok; pasifleştirme var. İkinci şube pasifleşir, ardından son aktif şube 409.
  await expect(page.getByRole('button', { name: /sil/i })).toHaveCount(0);
  await second.getByRole('button', { name: 'Passivləşdir' }).click();
  await expect(second).toContainText('Passiv');
  await expect(second.getByRole('button', { name: 'Aktivləşdir' })).toBeVisible();
  const first = rows.filter({ hasText: 'Mərkəz filialı' });
  await first.getByRole('button', { name: 'Passivləşdir' }).click();
  await expect(page.getByText('Son aktiv filial passivləşdirilə bilməz.')).toBeVisible();
  await expect(first.getByRole('button', { name: 'Aktivləşdir' })).toHaveCount(0);

  // Ekip ekranı: davet formunda şube seçimi yalnız aktif şubeyi listeler.
  await menu(page).getByRole('link', { name: 'Komanda' }).click();
  await page.waitForURL('**/az/buyer/team');
  await page.getByRole('button', { name: 'Dəvət et' }).click();
  const form = page.getByTestId('invite-form');
  await form.locator('select[name="roleId"]').selectOption({ label: 'Filial admini' });
  const branchSelect = form.locator('select[name="branchId"]');
  await expect(branchSelect.locator('option', { hasText: 'Mərkəz filialı' })).toHaveCount(1);
  await expect(branchSelect.locator('option', { hasText: 'Gənclik filialı' })).toHaveCount(0);
});
