// F2.9b (web): admin unvan ve rol şablonu kataloğu (US-012). İçerik ekibi menüden "Rol şablonları"
// açar, şablon yaratır (AC1), izinlerini değiştirir → yeni sürüm (AC2); "Vəzifələr"de şablona bağlı
// unvan yaratır, pasifleştirir ve kullanılmadığı için siler (AC3). Operasyon ekibi menüde görmez (V1).
import { randomUUID } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';
import { createPlatformStaff, loginPlatformThroughUi } from './fixtures';

// Platform girişi TOTP kurulumunu da içerir.
test.describe.configure({ timeout: 90_000 });

const menu = (page: Page) => page.getByRole('navigation', { name: 'Menyu' });
const suffix = () => randomUUID().replaceAll('-', '').slice(0, 10);

async function fillNames(page: Page, form: string, base: string): Promise<void> {
  const scope = page.getByTestId(form);
  await scope.locator('input[name="name.az"]').fill(`${base} az`);
  await scope.locator('input[name="name.ru"]').fill(`${base} ru`);
  await scope.locator('input[name="name.tr"]').fill(`${base} tr`);
}

test('US-012 AC1–AC3 şablon yarat, yeni versiya; vəzifə yarat, deaktiv et, sil', async ({
  page,
}) => {
  const staff = await createPlatformStaff('content');
  await loginPlatformThroughUi(page, 'az', staff.phone);
  await expect(menu(page).getByText('Topdançılar')).toHaveCount(0);
  await menu(page).getByText('Rol şablonları').click();
  await page.waitForURL('**/az/admin/role-templates');

  // AC1: boş form hataları, sonra şablon yaradılır.
  const code = `e2e_tpl_${suffix()}`;
  await page.getByRole('button', { name: 'Yeni şablon' }).click();
  const form = page.getByTestId('template-form');
  await form.getByRole('button', { name: 'Yadda saxla' }).click();
  await expect(form.locator('[aria-invalid="true"]')).toHaveCount(4);
  await form.locator('input[name="code"]').fill(code);
  await fillNames(page, 'template-form', 'E2E kassir');
  await form.locator('[data-permission="catalog.view"]').check();
  await form.locator('[data-permission="orders.view"]').check();
  await form.getByRole('button', { name: 'Yadda saxla' }).click();
  await expect(page.getByText('Şablon yaradıldı və bizneslərə əlavə olundu.')).toBeVisible();
  const row = page.locator(`[data-testid="template-row"][data-code="${code}"]`);
  await expect(row).toContainText('v1');
  await expect(row).toContainText('2 icazə');

  // AC2: izin dəyişir → v2.
  await row.getByRole('button', { name: 'Düzəlt' }).click();
  await expect(form.locator('input[name="code"]')).toBeDisabled();
  await form.locator('[data-permission="orders.view"]').uncheck();
  await form.getByRole('button', { name: 'Yadda saxla' }).click();
  await expect(page.getByText(/Yeni versiya: v2/)).toBeVisible();
  await expect(row).toContainText('v2');
  await expect(row).toContainText('1 icazə');

  // AC1 + AC3: vəzifə yaradılır, deaktiv edilir, silinir.
  await menu(page).getByText('Vəzifələr').click();
  await page.waitForURL('**/az/admin/job-titles');
  const titleCode = `e2e_jt_${suffix()}`;
  await page.getByRole('button', { name: 'Yeni vəzifə' }).click();
  const titleForm = page.getByTestId('job-title-form');
  await titleForm.locator('input[name="code"]').fill(titleCode);
  await titleForm.locator('select[name="roleTemplateId"]').selectOption({ label: 'E2E kassir az' });
  await fillNames(page, 'job-title-form', 'E2E vəzifə');
  await titleForm.getByRole('button', { name: 'Yadda saxla' }).click();
  await expect(page.getByText('Vəzifə yaradıldı; dəvət ekranında görünür.')).toBeVisible();
  const titleRow = page.locator(`[data-testid="job-title-row"][data-code="${titleCode}"]`);
  await expect(titleRow).toContainText('Aktiv');
  await expect(titleRow).toContainText('E2E kassir az');

  await titleRow.getByRole('button', { name: 'Deaktiv et' }).click();
  await expect(titleRow).toContainText('Deaktiv');
  await titleRow.getByRole('button', { name: 'Sil' }).click();
  await titleRow.getByRole('button', { name: 'Bəli, sil' }).click();
  await expect(page.getByText('Vəzifə silindi.')).toBeVisible();
  await expect(titleRow).toHaveCount(0);
});

test('F2.9 V1 operasiya rolu kataloq menyusunu görmür', async ({ page }) => {
  const staff = await createPlatformStaff('operations');
  await loginPlatformThroughUi(page, 'az', staff.phone);
  await expect(menu(page).getByText('Topdançılar')).toBeVisible();
  await expect(menu(page).getByText('Rol şablonları')).toHaveCount(0);
  await page.goto('/az/admin/job-titles');
  await page.waitForURL('**/az/admin');
});
