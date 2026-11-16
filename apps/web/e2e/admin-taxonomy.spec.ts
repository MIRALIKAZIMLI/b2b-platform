// F3.2b (web): admin kategori, marka, faaliyet alanı ekranları (US-029). İçerik ekibi menüden
// "Kateqoriyalar"ı açar, üst ve alt kategori yaratır, 3. seviyede alt eklenemez (AC1); kategoriyi
// deaktiv edir, altları "üst passiv" görünür (AC2); toptancı talebini təsdiqləyir və rədd edir (AC3);
// admin markası yaradır, eyni ad xətası (AC4); fəaliyyət sahəsi yaradır və deaktiv edir (AC2).
import { randomUUID } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';
import {
  addMembership,
  createBrandRequest,
  createPlatformStaff,
  createUser,
  loginPlatformThroughUi,
} from './fixtures';

// Platform girişi TOTP kurulumunu da içerir.
test.describe.configure({ timeout: 120_000 });

const menu = (page: Page) => page.getByRole('navigation', { name: 'Menyu' });
const suffix = () => randomUUID().replaceAll('-', '').slice(0, 8);

async function fillNames(page: Page, form: string, base: string): Promise<void> {
  const scope = page.getByTestId(form);
  await scope.locator('input[name="name.az"]').fill(`${base} az`);
  await scope.locator('input[name="name.ru"]').fill(`${base} ru`);
  await scope.locator('input[name="name.tr"]').fill(`${base} tr`);
}

const categoryRow = (page: Page, name: string) =>
  page.getByTestId('category-row').filter({ hasText: name });

test('F3.2b-AC1 F3.2b-AC2 kateqoriya ağacı: üst, alt, 3-cü səviyyə, deaktiv', async ({ page }) => {
  const staff = await createPlatformStaff('content');
  await loginPlatformThroughUi(page, 'az', staff.phone);
  await menu(page).getByText('Kateqoriyalar').click();
  await page.waitForURL('**/az/admin/categories');

  // AC1 + AC6: boş forma xətaları, sonra üst kateqoriya.
  const base = `E2E kat ${suffix()}`;
  await page.getByRole('button', { name: 'Yeni üst kateqoriya' }).click();
  const form = page.getByTestId('category-form');
  await form.getByRole('button', { name: 'Yadda saxla' }).click();
  await expect(form.locator('[aria-invalid="true"]')).toHaveCount(3);
  await fillNames(page, 'category-form', `${base} 1`);
  await form.getByRole('button', { name: 'Yadda saxla' }).click();
  await expect(page.getByText('Yaradıldı.')).toBeVisible();
  const root = categoryRow(page, `${base} 1 az`);
  await expect(root).toHaveAttribute('data-depth', '1');

  // 2-ci və 3-cü səviyyə satırdan; 3-cü səviyyədə "Alt kateqoriya" yoxdur.
  await root.getByRole('button', { name: 'Alt kateqoriya' }).click();
  await expect(form).toContainText(`${base} 1 az`);
  await fillNames(page, 'category-form', `${base} 2`);
  await form.getByRole('button', { name: 'Yadda saxla' }).click();
  const child = categoryRow(page, `${base} 2 az`);
  await expect(child).toHaveAttribute('data-depth', '2');
  await child.getByRole('button', { name: 'Alt kateqoriya' }).click();
  await fillNames(page, 'category-form', `${base} 3`);
  await form.getByRole('button', { name: 'Yadda saxla' }).click();
  const leaf = categoryRow(page, `${base} 3 az`);
  await expect(leaf).toHaveAttribute('data-depth', '3');
  await expect(leaf.getByRole('button', { name: 'Alt kateqoriya' })).toHaveCount(0);

  // AC4 (ad): eyni üst altında eyni ad → xəta.
  await root.getByRole('button', { name: 'Alt kateqoriya' }).click();
  await fillNames(page, 'category-form', `${base} 2`);
  await form.getByRole('button', { name: 'Yadda saxla' }).click();
  await expect(form.getByText('Bu ad artıq var.')).toBeVisible();
  await page.getByRole('button', { name: 'Ləğv et' }).click();

  // AC2: düzəliş + deaktiv; altlar "üst passiv", silmə düyməsi yoxdur.
  await child.getByRole('button', { name: 'Düzəlt' }).click();
  await form.locator('input[name="sortOrder"]').fill('7');
  await form.getByRole('button', { name: 'Yadda saxla' }).click();
  await expect(child).toContainText('Sıra: 7');
  await root.getByRole('button', { name: 'Deaktiv et' }).click();
  await expect(root.getByRole('button', { name: 'Aktiv et' })).toBeVisible();
  await expect(leaf).toContainText('Üst kateqoriya deaktivdir');
  await expect(child.getByRole('button', { name: 'Alt kateqoriya' })).toHaveCount(0);
  await expect(page.getByTestId('category-row').getByRole('button', { name: 'Sil' })).toHaveCount(
    0,
  );
  await root.getByRole('button', { name: 'Aktiv et' }).click();
  await expect(leaf).not.toContainText('Üst kateqoriya deaktivdir');
});

test('F3.2b-AC3 F3.2b-AC4 brend sorğusu təsdiq, rədd; admin brendi', async ({ page }) => {
  const seller = await createUser();
  const { businessId } = await addMembership(seller.id, 'seller_business_admin', 'E2E Brend MMC');
  const approveName = `E2E Brend A ${suffix()}`;
  const rejectName = `E2E Brend R ${suffix()}`;
  await createBrandRequest(businessId, seller.id, approveName);
  await createBrandRequest(businessId, seller.id, rejectName);

  const staff = await createPlatformStaff('content');
  await loginPlatformThroughUi(page, 'az', staff.phone);
  await menu(page).getByText('Brendlər').click();
  await page.waitForURL('**/az/admin/brands');
  await expect(page.getByTestId('brand-tab-requested')).toHaveAttribute('aria-selected', 'true');

  // AC3: təsdiq tək kliklə.
  const approveRow = page.locator(`[data-testid="brand-row"][data-name="${approveName}"]`);
  await expect(approveRow).toContainText('E2E Brend MMC');
  await approveRow.getByRole('button', { name: 'Təsdiqlə' }).click();
  await expect(page.getByText(/Brend təsdiqləndi/)).toBeVisible();
  await expect(approveRow).toHaveCount(0);

  // AC3: rədd təsdiq pəncərəsi ilə; "Ləğv et" heç nə dəyişmir.
  const rejectRow = page.locator(`[data-testid="brand-row"][data-name="${rejectName}"]`);
  await rejectRow.getByRole('button', { name: 'Rədd et' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Ləğv et' }).click();
  await expect(rejectRow).toBeVisible();
  await rejectRow.getByRole('button', { name: 'Rədd et' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Bəli, rədd et' }).click();
  await expect(page.getByText(/Sorğu rədd edildi/)).toBeVisible();
  await expect(rejectRow).toHaveCount(0);

  await page.getByTestId('brand-tab-rejected').click();
  await page.getByLabel('Brend axtar').fill(rejectName);
  await expect(rejectRow).toContainText('Rədd edilib');
  await expect(rejectRow.getByRole('button')).toHaveCount(0);

  // AC4: admin brendi aktiv açılır; eyni ad (böyük-kiçik hərf fərqsiz) xəta verir; deaktiv.
  await page.getByRole('button', { name: 'Yeni brend' }).click();
  const form = page.getByTestId('brand-form');
  await form.locator('input[name="name"]').fill(approveName.toUpperCase());
  await form.getByRole('button', { name: 'Yadda saxla' }).click();
  await expect(form.getByText('Bu ad artıq var.')).toBeVisible();
  const adminName = `E2E Admin brend ${suffix()}`;
  await form.locator('input[name="name"]').fill(adminName);
  await form.getByRole('button', { name: 'Yadda saxla' }).click();
  await expect(page.getByText('Brend yaradıldı və aktivdir.')).toBeVisible();
  await expect(page.getByTestId('brand-tab-active')).toHaveAttribute('aria-selected', 'true');
  await page.getByLabel('Brend axtar').fill(adminName);
  const adminRow = page.locator(`[data-testid="brand-row"][data-name="${adminName}"]`);
  await expect(adminRow).toContainText('Platforma tərəfindən');
  await adminRow.getByRole('button', { name: 'Deaktiv et' }).click();
  await expect(adminRow.getByRole('button', { name: 'Aktiv et' })).toBeVisible();
});

test('F3.2b-AC2 fəaliyyət sahəsi yaradılır, düzəldilir, deaktiv edilir', async ({ page }) => {
  const staff = await createPlatformStaff('super_admin');
  await loginPlatformThroughUi(page, 'az', staff.phone);
  await menu(page).getByText('Fəaliyyət sahələri').click();
  await page.waitForURL('**/az/admin/activity-types');

  const base = `E2E sahə ${suffix()}`;
  await page.getByRole('button', { name: 'Yeni fəaliyyət sahəsi' }).click();
  const form = page.getByTestId('activity-type-form');
  await fillNames(page, 'activity-type-form', base);
  await form.locator('input[name="sortOrder"]').fill('abc');
  await form.getByRole('button', { name: 'Yadda saxla' }).click();
  await expect(form.getByText('0 ilə 10000 arasında tam ədəd yazın.')).toBeVisible();
  await form.locator('input[name="sortOrder"]').fill('900');
  await form.getByRole('button', { name: 'Yadda saxla' }).click();
  await expect(page.getByText('Yaradıldı.')).toBeVisible();
  const row = page.getByTestId('activity-type-row').filter({ hasText: `${base} az` });
  await expect(row).toContainText('Sıra: 900');
  await row.getByRole('button', { name: 'Deaktiv et' }).click();
  await expect(row.getByRole('button', { name: 'Aktiv et' })).toBeVisible();
  await expect(row.getByRole('button', { name: 'Sil' })).toHaveCount(0);
});

test('F3.2b-AC5 operasiya rolu kateqoriya, brend, fəaliyyət sahəsi menyusunu görmür', async ({
  page,
}) => {
  const staff = await createPlatformStaff('operations');
  await loginPlatformThroughUi(page, 'az', staff.phone);
  await expect(menu(page).getByText('Kateqoriyalar')).toHaveCount(0);
  await expect(menu(page).getByText('Brendlər')).toHaveCount(0);
  await page.goto('/az/admin/brands');
  await page.waitForURL('**/az/admin');
});
