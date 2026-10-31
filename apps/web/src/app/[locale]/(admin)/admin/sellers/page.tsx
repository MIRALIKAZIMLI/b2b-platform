import { SellerAdminOnly } from '../../../../../features/admin-sellers/seller-admin-only';
import { SellerList } from '../../../../../features/admin-sellers/seller-list';

/** Toptancılar (F2.1b, US-009): yalnız super_admin ve operations (S1). */
export default function AdminSellersPage() {
  return (
    <SellerAdminOnly>
      <SellerList />
    </SellerAdminOnly>
  );
}
