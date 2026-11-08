// F2.8 (web): işletmeye özel rol (US-014 AC1, AC2). Toptancı admini ekip ekranındaki "Rollar"
// kartından şablonu kopyalar, izin kapatıp açar ve kaydeder; rol "Xüsusi" rozetiyle listelenir ve
// davet formunun rol seçiminde görünür. Seller rolünde buyer izinleri sunulmaz (AC2). Rol düzenlenir.
import { expect, test } from '@playwright/test';
import { addMembership, addSubscription, createUser, loginThroughUi } from './fixtures';

test('US-014 AC1 şablondan özel rol → listede ve davette; AC2 buyer izni sunulmaz; düzenleme', async ({
  page,
}) => {
  const admin = await createUser('az');
  const { businessId } = await addMembership(admin.id, 'seller_business_admin', 'E2E Rol Topdan');
  await addSubscription(businessId, 'pilot');

  await loginThroughUi(page, 'az', admin.phone);
  await page.waitForURL('**/az/seller');
  await page.goto('/az/seller/team');
  await expect(page.getByRole('heading', { name: 'Rollar' })).toBeVisible();
  await expect(page.getByTestId('role-row')).toHaveCount(1);

  // AC1: şablon seçilince ad ve izinler dolar; bir izin kapatılır, biri açılır.
  await page.getByRole('button', { name: 'Şablondan yeni rol' }).click();
  const form = page.getByTestId('role-form');
  await form.getByRole('button', { name: 'Yadda saxla' }).click();
  await expect(form.locator('select[name="templateId"][aria-invalid="true"]')).toBeVisible();
  await form.locator('select[name="templateId"]').selectOption({ label: 'Satış meneceri' });
  await expect(form.locator('input[name="name"]')).toHaveValue('Satış meneceri');
  await expect(form.getByLabel('Qiymətləri idarə etmək')).toBeChecked();
  // AC2: seller rolünde buyer izni (səbət) yoxdur.
  await expect(form.getByText('Səbəti təsdiqləmək')).toHaveCount(0);
  await form.getByLabel('Qiymətləri idarə etmək').uncheck();
  await form.getByLabel('Komandanı idarə etmək').check();
  await form.locator('input[name="name"]').fill('Kiçik menecer');
  await form.getByRole('button', { name: 'Yadda saxla' }).click();
  await expect(page.getByText('Rol yaradıldı.')).toBeVisible();
  const custom = page.getByTestId('role-row').filter({ hasText: 'Kiçik menecer' });
  await expect(custom).toContainText('Xüsusi');
  await expect(custom).toContainText('15 icazə');

  // Davet formunun rol seçiminde özel rol var.
  await page.getByRole('button', { name: 'Dəvət et' }).click();
  await expect(
    page.getByTestId('invite-form').locator('select[name="roleId"] option', {
      hasText: 'Kiçik menecer',
    }),
  ).toHaveCount(1);
  await page.getByRole('button', { name: 'Ləğv et' }).click();

  // Düzenleme: izin kapatılır → sayı azalır.
  await custom.getByRole('button', { name: 'Redaktə et' }).click();
  await expect(form.locator('select[name="templateId"]')).toHaveCount(0);
  await form.getByLabel('Komandanı idarə etmək').uncheck();
  await form.getByRole('button', { name: 'Yadda saxla' }).click();
  await expect(page.getByText('Rol yeniləndi.')).toBeVisible();
  await expect(custom).toContainText('14 icazə');
});
