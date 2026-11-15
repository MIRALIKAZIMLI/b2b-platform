// F2.19 (web): admin "Ayarlar" ekranı (US-017). Süper admin bir perakendeciyi seçer, işletme
// kapsamında ekip daveti süresini değiştirir (AC1); bekleme süresine 6 yazınca ekran reddeder
// (AC3). Platform kapsamına yazılmaz: diğer E2E testlerinin okuduğu değerler değişmez.
import { randomUUID } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';
import { addMembership, createPlatformStaff, createUser, loginPlatformThroughUi } from './fixtures';

test.describe.configure({ timeout: 120_000 });

const menu = (page: Page) => page.getByRole('navigation', { name: 'Menyu' });

async function openSettings(page: Page, role: string): Promise<void> {
  const staff = await createPlatformStaff(role);
  await loginPlatformThroughUi(page, 'az', staff.phone);
}

test('US-017 AC1, AC3 müəssisə səviyyəsində ayar: dəyişmə və həddən kənar dəyər', async ({
  page,
}) => {
  const name = `E2E Ayar ${randomUUID().slice(0, 6)}`;
  const user = await createUser();
  const { businessId } = await addMembership(user.id, 'buyer_business_admin', name);
  await openSettings(page, 'super_admin');
  await menu(page).getByRole('link', { name: 'Parametrlər' }).click();
  await page.waitForURL('**/az/admin/settings');

  // Platforma: bütün ayarlar, "Standart" mənbəyi.
  await expect(page.getByText('connection.request_ttl_days')).toBeVisible();

  await page.getByRole('radio', { name: 'Müəssisə' }).click();
  await page.getByLabel('Müəssisə', { exact: true }).selectOption(businessId);
  // T2: yalnız platforma ayarı müəssisə səviyyəsində görünmür.
  await expect(page.getByText('connection.daily_request_quota')).toBeVisible();
  await expect(page.getByText('connection.request_ttl_days')).toHaveCount(0);

  await page.getByRole('button', { name: 'Dəyişdir: Komanda dəvəti (gün)' }).click();
  const input = page.locator('#setting-invitation\\.team_days');
  await input.fill('3');
  await page.getByRole('button', { name: 'Yadda saxla' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Yadda saxlandı' })).toBeVisible();

  await page.getByRole('button', { name: 'Dəyişdir: Rəddən sonra gözləmə (gün)' }).click();
  await page.locator('#setting-connection\\.cooldown_after_reject_days').fill('6');
  await expect(
    page.getByRole('alert').filter({ hasText: 'icazə verilən hədlərdən kənardadır' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Yadda saxla' })).toBeDisabled();
});

test('F2.19-AC4 əməliyyat rolu ayarları görmür', async ({ page }) => {
  await openSettings(page, 'operations');
  await expect(menu(page).getByRole('link', { name: 'Parametrlər' })).toHaveCount(0);
  await page.goto('/az/admin/settings');
  await page.waitForURL((url) => !url.pathname.endsWith('/admin/settings'));
});
