// F3.5b (web): Excel ürün içe aktarma sihirbazı (US-031 AC1–AC3; S1 = A; Müfettiş 29 #84 not 1).
// Şablon indirme, .xlsx yükleme ve iş açma gerçek API ile; E2E'de worker olmadığından sonraki
// durumlar (`preview_ready`, `applying`, `done`, `failed`) `GET/POST /imports/{id}` yanıtları
// taklit edilerek gösterilir (doğrulama ve uygulama F3.5a/F3.5c entegrasyon testlerinde).
// SHOTS dizini verilirse her adımda ekran görüntüsü kaydedilir (yalnız yerel).
import { expect, type Page, type Route, test } from '@playwright/test';
import { addMembership, addSubscription, createUser, loginThroughUi } from './fixtures';

test.describe.configure({ timeout: 180_000 });

const SHOTS = process.env.SHOTS;

async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS !== undefined && SHOTS !== '') {
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
  }
}

// ZIP yerel dosya başlığı: F1.10 imza denetimi .xlsx için yalnız ZIP imzasına bakar.
const XLSX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(60)]);

type Mock = 'real' | 'preview' | 'applying' | 'done' | 'failed';

function jobBody(id: string, state: Exclude<Mock, 'real'>) {
  const now = new Date().toISOString();
  const preview = { insert: 6, update: 3, error: 1, warning: 1 };
  return {
    id,
    type: 'products',
    status: {
      preview: 'preview_ready',
      applying: 'applying',
      done: 'done',
      failed: 'failed',
    }[state],
    stats:
      state === 'done'
        ? { insert: 6, update: 3, error: 1, warning: 1 }
        : state === 'failed'
          ? { insert: 0, update: 0, error: 0, warning: 0 }
          : preview,
    notes: state === 'preview' ? ['stock_column_ignored'] : [],
    problems:
      state === 'preview'
        ? [
            { row: 4, sku: 'CAY-1', issues: [{ column: 'category', code: 'not_found' }] },
            {
              row: 7,
              sku: 'SU-2',
              issues: [{ column: 'price', code: 'price_ignored_no_permission' }],
            },
          ]
        : [],
    failureCode: state === 'failed' ? 'APPLY_FAILED' : null,
    appliedUntilRow: state === 'applying' ? 6 : state === 'failed' ? 501 : null,
    errorReportUrl: state === 'preview' ? '/api/v1/dev/storage/report.xlsx' : null,
    resultReportUrl: state === 'done' ? '/api/v1/dev/storage/result.xlsx' : null,
    expiresAt: state === 'preview' ? new Date(Date.now() + 86_400_000).toISOString() : null,
    // F3.7b: sözleşme alanları (#85 `canApply`; ürün işinde `buyerId` boş).
    buyerId: null,
    canApply: state === 'preview',
    createdAt: now,
    updatedAt: now,
  };
}

test('F3.5b-AC1 F3.5b-AC2 F3.5b-AC3 F3.5b-PROG F3.5b-PART şablon, yükleme, önizleme, onay ve sonuç', async ({
  page,
}) => {
  const admin = await createUser('az');
  const { businessId } = await addMembership(admin.id, 'seller_business_admin', 'E2E İdxal Topdan');
  await addSubscription(businessId, 'pilot');

  await loginThroughUi(page, 'az', admin.phone);
  await page.waitForURL('**/az/seller');
  await page.goto('/az/seller/products');
  await page.getByRole('link', { name: 'Excel ilə idxal' }).click();
  await page.waitForURL('**/az/seller/products/import');
  await expect(page.getByTestId('import-step-upload')).toHaveAttribute('data-state', 'current');
  await shot(page, '1-yukleme-az');

  // AC1: şablon kullanıcının dilinde indirilir.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Şablonu endir' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.xlsx$/);

  // Tür dışı dosya istemcide reddedilir.
  const input = page.getByTestId('import-file-input');
  await input.setInputFiles({ name: 'mal.csv', mimeType: 'text/csv', buffer: Buffer.from('a') });
  await expect(page.getByText('Yalnız .xlsx faylı seçin.')).toBeVisible();

  // AC2: yükleme gerçek API ile iş açar; worker yokken "yoxlanılır" görünür.
  let mock: Mock = 'real';
  let applyStatus = 403;
  await page.route(/\/api\/v1\/imports\/[0-9a-f-]{36}(\/apply)?$/, async (route: Route) => {
    const url = new URL(route.request().url());
    const id = url.pathname.split('/')[4] ?? '';
    if (route.request().method() === 'POST') {
      if (applyStatus === 403) {
        await route.fulfill({
          status: 403,
          json: { code: 'PERMISSION_DENIED', message: 'x', details: {} },
        });
        return;
      }
      mock = 'applying';
      await route.fulfill({ status: 202, json: jobBody(id, 'applying') });
      return;
    }
    if (mock === 'real') {
      await route.continue();
      return;
    }
    await route.fulfill({ status: 200, json: jobBody(id, mock) });
  });
  await input.setInputFiles({
    name: 'mallar.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: XLSX,
  });
  await page.waitForURL(/\/az\/seller\/products\/import\?job=[0-9a-f-]{36}$/);
  await expect(page.getByTestId('import-checking')).toContainText('Fayl yoxlanılır…');
  await expect(page.getByTestId('import-step-check')).toHaveAttribute('data-state', 'current');

  // Önizleme: sayılar, nedenler, rapor, ileri tarihli fiyat bilgisi.
  mock = 'preview';
  await expect(page.getByTestId('import-preview')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('import-stat-insert')).toContainText('6');
  await expect(page.getByTestId('import-stat-update')).toContainText('3');
  await expect(page.getByTestId('import-stat-error')).toContainText('1');
  await expect(page.getByTestId('import-problems')).toContainText('Tapılmadı.');
  await expect(page.getByText('Stok izlənmədiyi üçün stok sütunu nəzərə alınmır.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Problemlər hesabatını endir' })).toBeVisible();
  await expect(page.getByText(/gələcək tarixli qiyməti/)).toBeVisible();
  await shot(page, '2-onizleme-az');

  // S1 = A: işi açmayan (veya fiyat izni kalkan) kullanıcıya 403 → neden yazılır, düğme kalkar.
  await page.getByRole('button', { name: 'Təsdiqlə və tətbiq et (9)' }).click();
  await expect(page.getByText(/yalnız faylı yükləyən/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Təsdiqlə və tətbiq et/ })).toHaveCount(0);
  await shot(page, '3-onay-403-az');

  // AC3: onay → ilerleme → sonuç raporu.
  applyStatus = 202;
  await page.reload();
  await page.getByRole('button', { name: 'Təsdiqlə və tətbiq et (9)' }).click();
  await expect(page.getByTestId('import-applying')).toContainText('5 / 10 sətir');
  await shot(page, '4-uygulaniyor-az');
  mock = 'done';
  await expect(page.getByTestId('import-done')).toContainText('İdxal tamamlandı', {
    timeout: 15_000,
  });
  await expect(page.getByTestId('import-done')).toContainText('9 sətir tətbiq olundu');
  await expect(page.getByRole('link', { name: 'Nəticə hesabatını endir' })).toBeVisible();
  await expect(page.getByTestId('import-step-result')).toHaveAttribute('data-state', 'current');
  await shot(page, '5-sonuc-az');

  // Kısmi uygulama (Müfettiş 29 not 1): uygulanan satır sayısı açıkça yazılır.
  mock = 'failed';
  await page.reload();
  await expect(page.getByTestId('import-failed')).toContainText('Tətbiq yarımçıq dayandı');
  await expect(page.getByTestId('import-failed')).toContainText('ilk 500 sətri tətbiq olundu');
  await shot(page, '6-yarida-kaldi-az');

  // Dar ekran: yeni içe aktarmaya dönülür.
  await page.setViewportSize({ width: 375, height: 800 });
  await page.getByRole('button', { name: 'Yenidən başla' }).click();
  await page.waitForURL('**/az/seller/products/import');
  await expect(page.getByRole('button', { name: 'Şablonu endir' })).toBeVisible();
  await shot(page, '7-dar-ekran-az');
});
