import { SellerAdminOnly } from '../../../../../../features/admin-sellers/seller-admin-only';
import { SellerForm } from '../../../../../../features/admin-sellers/seller-form';

/** Yeni toptancı (F2.1b, US-009 AC1, AC4). */
export default function NewSellerPage() {
  return (
    <SellerAdminOnly>
      <SellerForm />
    </SellerAdminOnly>
  );
}
