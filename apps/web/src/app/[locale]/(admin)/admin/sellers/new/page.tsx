import { SellerAdminOnly } from '../../../../../../features/admin-sellers/seller-admin-only';
import { SellerForm } from '../../../../../../features/admin-sellers/seller-form';

/**
 * Yeni toptancı (F2.1b, US-009 AC1, AC4). `?application=<id>` ile başvurudan açma (F2.2b): form
 * başvuruyla doldurulur, gönderimde başvuru aynı işlemde onaylanır.
 */
export default async function NewSellerPage({
  searchParams,
}: {
  searchParams: Promise<{ application?: string | string[] }>;
}) {
  const { application } = await searchParams;
  const applicationId = typeof application === 'string' ? application : undefined;
  return (
    <SellerAdminOnly>
      <SellerForm {...(applicationId === undefined ? {} : { applicationId })} />
    </SellerAdminOnly>
  );
}
