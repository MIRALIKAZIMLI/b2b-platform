import { BuyerAdminOnly } from '../../../../../features/admin-buyers/buyer-admin-only';
import { BuyersPage } from '../../../../../features/admin-buyers/buyers-page';

/** Perakendeciler (F2.18b, US-015, US-016): super_admin ve operations yönetir, support görür. */
export default function AdminBuyersPage() {
  return (
    <BuyerAdminOnly>
      <BuyersPage />
    </BuyerAdminOnly>
  );
}
