// E2E-02 (test-strategy §5) ve F2.1b kabul testleri: platform admini toptancı açar → yetkili SMS'teki
// aktivasyon bağlantısıyla OTP girişi yapar → işletme admini olarak `/seller` açılır (US-009).
import { type Browser, expect, type Page, test } from '@playwright/test';
import {
  addMembership,
  completeOtpLogin,
  createPlatformStaff,
  createRegion,
  createUser,
  latestActivationPath,
  loginPlatformThroughUi,
  loginThroughUi,
  randomPhone,
  randomVoen,
} from './fixtures';

// Platform girişi TOTP kurulumunu da içerir; varsayılan 30 sn yetmeyebilir.
test.describe.configure({ timeout: 90_000 });

const menu = (page: Page) => page.getByRole('navigation', { name: 'Menyu' });

interface SellerInput {
  readonly legalName: string;
  readonly voen: string;
  readonly ownerPhone: string;
  readonly regionName: string;
}

async function newSellerInput(): Promise<SellerInput> {
  const region = await createRegion();
  return {
    legalName: `E2E Topdan ${randomVoen()} MMC`,
    voen: randomVoen(),
    ownerPhone: randomPhone(),
    regionName: region.name,
  };
}

/** Admin: menüden Toptancılar → Yeni topdançı → formu doldur → Yarat. */
async function submitSellerForm(page: Page, input: SellerInput): Promise<void> {
  await page.goto('/az/admin/sellers/new');
  await page.locator('input[name="legalName"]').fill(input.legalName);
  await page.locator('input[name="voen"]').fill(input.voen);
  await page.locator('select[name="regionId"]').selectOption({ label: input.regionName });
  await page.locator('input[name="addressLine"]').fill('Nizami küç. 1');
  await page.locator('input[name="ownerName"]').fill('E2E Səlahiyyətli');
  await page.locator('input[name="ownerPhone"]').fill(input.ownerPhone);
  await page.locator('select[name="planId"]').selectOption({ index: 1 });
  await page
    .locator('select[name="serviceAreaRegionIds"]')
    .selectOption({ label: input.regionName });
  await expect(page.locator('input[name="currency"]')).toHaveValue('AZN');
  await expect(page.locator('input[name="timezone"]')).toHaveValue('Asia/Baku');
  await page.getByRole('button', { name: 'Yarat' }).click();
}

async function adminPage(browser: Browser): Promise<Page> {
  const staff = await createPlatformStaff('operations');
  const page = await (await browser.newContext()).newPage();
  await loginPlatformThroughUi(page, 'az', staff.phone);
  return page;
}

const sellerRow = (page: Page, legalName: string) =>
  page.getByRole('row').filter({ hasText: legalName });

test('E2E-02: admin toptancı açar → yetkili aktivasyon bağlantısıyla girer → /seller (F2.1b-AC1)', async ({
  browser,
}) => {
  const admin = await adminPage(browser);
  await menu(admin).getByRole('link', { name: 'Topdançılar' }).click();
  await admin.waitForURL('**/az/admin/sellers');

  const input = await newSellerInput();
  await submitSellerForm(admin, input);
  await admin.waitForURL('**/az/admin/sellers');
  const row = sellerRow(admin, input.legalName);
  await expect(row).toContainText(input.voen);
  await expect(row.locator('[data-activation]')).toHaveAttribute('data-activation', 'pending');
  await expect(row.getByRole('button', { name: 'Yenidən göndər' })).toBeVisible();

  const path = await latestActivationPath(admin.request, input.ownerPhone);
  const owner = await (await browser.newContext()).newPage();
  await owner.goto(path);
  await expect(
    owner.getByRole('heading', { level: 1, name: 'Hesabın aktivləşdirilməsi' }),
  ).toBeVisible();
  await completeOtpLogin(owner, input.ownerPhone);
  await owner.waitForURL('**/az/seller');
  await expect(owner.getByRole('combobox', { name: 'Biznes' })).toContainText(input.legalName);
  await expect(menu(owner).getByText('Komanda')).toBeVisible();
  await expect(menu(owner).getByText('Parametrlər')).toBeVisible();

  await admin.reload();
  await expect(sellerRow(admin, input.legalName).locator('[data-activation]')).toHaveAttribute(
    'data-activation',
    'accepted',
  );
});

test('F2.1b-AC2: geçersiz bağlantı açıklayıcı hata verir; "Yeniden gönder" sonrası yeni bağlantı çalışır', async ({
  browser,
}) => {
  const admin = await adminPage(browser);
  const input = await newSellerInput();
  await submitSellerForm(admin, input);
  await admin.waitForURL('**/az/admin/sellers');
  const oldPath = await latestActivationPath(admin.request, input.ownerPhone);

  // Yeniden gönderim eski açık daveti geçersiz kılar (API, US-009 AC3).
  const row = sellerRow(admin, input.legalName);
  await row.getByRole('button', { name: 'Yenidən göndər' }).click();
  await expect(row.getByRole('status')).toHaveText('Yeni aktivləşmə linki göndərildi.');
  const newPath = await latestActivationPath(admin.request, input.ownerPhone);
  expect(newPath).not.toBe(oldPath);

  const owner = await (await browser.newContext()).newPage();
  await owner.goto(oldPath);
  await completeOtpLogin(owner, input.ownerPhone);
  await expect(owner.getByRole('main').getByRole('alert')).toHaveText(
    'Link etibarsızdır və ya vaxtı keçib; platforma administratorundan yenisini istəyin.',
  );

  // Oturum açık: yeni bağlantı doğrudan kabul edilir.
  await owner.goto(newPath);
  await owner.waitForURL('**/az/seller');
  await expect(owner.getByRole('combobox', { name: 'Biznes' })).toContainText(input.legalName);

  // Bağlantısız token de aynı mesaj.
  await owner.goto('/az/activate');
  await expect(owner.getByRole('main').getByRole('alert')).toHaveText(
    'Link etibarsızdır və ya vaxtı keçib; platforma administratorundan yenisini istəyin.',
  );
});

test('F2.1b-AC3: aynı VÖEN → VÖEN alanında hata, kayıt yok', async ({ browser }) => {
  const admin = await adminPage(browser);
  const first = await newSellerInput();
  await submitSellerForm(admin, first);
  await admin.waitForURL('**/az/admin/sellers');

  const second = { ...(await newSellerInput()), voen: first.voen };
  await submitSellerForm(admin, second);
  await expect(admin.locator('#seller-voen-error')).toHaveText(
    'Bu VÖEN ilə biznes artıq qeydiyyatdadır.',
  );
  await expect(admin.locator('input[name="voen"]')).toHaveAttribute('aria-invalid', 'true');
  await expect(admin).toHaveURL(/\/az\/admin\/sellers\/new$/);

  await admin.goto('/az/admin/sellers');
  await expect(sellerRow(admin, first.legalName)).toHaveCount(1);
  await expect(sellerRow(admin, second.legalName)).toHaveCount(0);
});

test('F2.1b-AC4: token yüklemeden sonra adres çubuğunda yok; sayfa Referrer-Policy: no-referrer', async ({
  page,
}) => {
  const response = await page.goto('/az/activate?token=e2e-sadece-bicim-denemesi');
  expect(response?.headers()['referrer-policy']).toBe('no-referrer');
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');
  await expect(page.locator('input[name="phone"]')).toBeVisible();
  await expect(page).toHaveURL(/\/az\/activate$/);
  expect(await page.evaluate(() => window.location.search)).toBe('');
  expect(await page.evaluate(() => JSON.stringify(window.localStorage))).toBe('{}');
  expect(await page.evaluate(() => JSON.stringify(window.sessionStorage))).toBe('{}');
});

test('F2.1b-AC5: işletme kullanıcısı /admin/sellers adresinde kendi alanına yönlenir', async ({
  page,
}) => {
  const user = await createUser();
  await addMembership(user.id, 'seller_business_admin', 'E2E Yönləndirmə MMC');
  await loginThroughUi(page, 'az', user.phone);
  await page.waitForURL('**/az/seller');
  await page.goto('/az/admin/sellers');
  await page.waitForURL('**/az/seller');
  await expect(menu(page).getByText('Topdançılar')).toHaveCount(0);
});
