// F2.2b uçtan uca (US-008): giriş ekranında yalnız başvuru yolu (AC2), kimliksiz başvuru (AC1),
// aynı VÖEN ile ikinci başvuru (AC3), admin başvuru listesi, ret ve başvurudan toptancı açma.
// IP hız sınırı saatte 5 başvuru (seller_application.ip_max_per_hour): bu dosya 4 başvuru gönderir.
import { type Browser, expect, type Page, test } from '@playwright/test';
import {
  createPlatformStaff,
  createRegion,
  loginPlatformThroughUi,
  randomPhone,
  randomVoen,
} from './fixtures';

test.describe.configure({ timeout: 90_000 });

interface Application {
  readonly legalName: string;
  readonly voen: string;
  readonly contactName: string;
  readonly phone: string;
  readonly regionName: string;
}

async function newApplication(): Promise<Application> {
  const region = await createRegion();
  return {
    legalName: `E2E Müraciət ${randomVoen()} MMC`,
    voen: randomVoen(),
    contactName: 'E2E Müraciətçi',
    phone: randomPhone(),
    regionName: region.name,
  };
}

/** Giriş ekranı → "Topdançı olmaq istəyirəm" → formu doldur → gönder. */
async function apply(page: Page, input: Application): Promise<void> {
  await page.goto('/az/login');
  await page.getByTestId('seller-application-link').click();
  await page.waitForURL('**/az/seller-application');
  await page.locator('input[name="legalName"]').fill(input.legalName);
  await page.locator('input[name="voen"]').fill(input.voen);
  await page.locator('select[name="regionId"]').selectOption({ label: input.regionName });
  await page.locator('input[name="contactName"]').fill(input.contactName);
  await page.locator('input[name="phone"]').fill(input.phone);
  await page.locator('textarea[name="categoryNote"]').fill('Ərzaq, içkilər');
  await page.getByRole('button', { name: 'Müraciət göndər' }).click();
}

async function adminPage(browser: Browser): Promise<Page> {
  const staff = await createPlatformStaff('operations');
  const page = await (await browser.newContext()).newPage();
  await loginPlatformThroughUi(page, 'az', staff.phone);
  return page;
}

const applicationCard = (page: Page, legalName: string) =>
  page.getByTestId('seller-application-row').filter({ hasText: legalName });

test('US-008-AC2: giriş ekranında toptancı için kayıt seçeneği yok, yalnız başvuru bağlantısı var', async ({
  page,
}) => {
  await page.goto('/az/login');
  const link = page.getByTestId('seller-application-link');
  await expect(link).toHaveAttribute('href', '/az/seller-application');
  await expect(link).toContainText('Topdançı olmaq istəyirəm');
  await expect(page.getByRole('link', { name: /qeydiyyat/i })).toHaveCount(0);
});

test('US-008-AC1, AC3: başvuru gönderilir; aynı VÖEN ile ikinci başvuru VÖEN alanında reddedilir', async ({
  browser,
}) => {
  const visitor = await (await browser.newContext()).newPage();
  const input = await newApplication();
  await apply(visitor, input);
  await expect(visitor.getByRole('status')).toHaveText('Müraciətiniz qəbul edildi');

  const second = await (await browser.newContext()).newPage();
  await apply(second, { ...(await newApplication()), voen: input.voen });
  await expect(second.locator('#application-voen-error')).toHaveText(
    'Bu VÖEN ilə baxılmaqda olan müraciət artıq var.',
  );
  await expect(second.locator('input[name="voen"]')).toHaveAttribute('aria-invalid', 'true');

  // AC1: başvuru adminin "Gözləyən" listesinde.
  const admin = await adminPage(browser);
  await admin.goto('/az/admin/seller-applications');
  const card = applicationCard(admin, input.legalName);
  await expect(card).toContainText(input.voen);
  await expect(card).toContainText(input.phone);
  await expect(card).toContainText('Ərzaq, içkilər');
});

test('F2.2b: admin başvuruyu reddeder; başka başvurudan toptancı açar', async ({ browser }) => {
  const visitor = await (await browser.newContext()).newPage();
  const rejected = await newApplication();
  await apply(visitor, rejected);
  await expect(visitor.getByRole('status')).toHaveText('Müraciətiniz qəbul edildi');
  const approved = await newApplication();
  await apply(visitor, approved);
  await expect(visitor.getByRole('status')).toHaveText('Müraciətiniz qəbul edildi');

  const admin = await adminPage(browser);
  await admin
    .getByRole('navigation', { name: 'Menyu' })
    .getByRole('link', { name: 'Müraciətlər' })
    .click();
  await admin.waitForURL('**/az/admin/seller-applications');

  // Ret: ikinci onayla.
  const toReject = applicationCard(admin, rejected.legalName);
  await toReject.getByRole('button', { name: 'Rədd et' }).click();
  await toReject.getByRole('button', { name: 'Bəli, rədd et' }).click();
  await expect(applicationCard(admin, rejected.legalName)).toHaveCount(0);
  await admin.getByRole('tab', { name: 'Rədd edilmiş' }).click();
  await expect(applicationCard(admin, rejected.legalName)).toContainText('Rədd edilmiş');

  // Başvurudan açma: form başvuruyla dolu; plan ve hizmet bölgesi seçilir.
  await admin.getByRole('tab', { name: 'Gözləyən' }).click();
  await applicationCard(admin, approved.legalName)
    .getByRole('button', { name: 'Topdançı aç' })
    .click();
  await admin.waitForURL('**/az/admin/sellers/new?application=*');
  await expect(admin.locator('input[name="legalName"]')).toHaveValue(approved.legalName);
  await expect(admin.locator('input[name="voen"]')).toHaveValue(approved.voen);
  await expect(admin.locator('input[name="ownerPhone"]')).toHaveValue(approved.phone);
  await admin.locator('select[name="planId"]').selectOption({ index: 1 });
  await admin
    .locator('select[name="serviceAreaRegionIds"]')
    .selectOption({ label: approved.regionName });
  await admin.getByRole('button', { name: 'Yarat' }).click();
  await admin.waitForURL('**/az/admin/sellers');
  await expect(admin.getByRole('row').filter({ hasText: approved.legalName })).toHaveCount(1);

  await admin.goto('/az/admin/seller-applications');
  await admin.getByRole('tab', { name: 'Təsdiqlənmiş' }).click();
  await expect(applicationCard(admin, approved.legalName)).toContainText('Təsdiqlənmiş');
});
