import { ApplicationList } from '../../../../../features/admin-seller-applications/application-list';
import { SellerAdminOnly } from '../../../../../features/admin-sellers/seller-admin-only';

/** Toptancı başvuruları (F2.2b, US-008 AC1): yalnız super_admin ve operations (S1). */
export default function AdminSellerApplicationsPage() {
  return (
    <SellerAdminOnly>
      <ApplicationList />
    </SellerAdminOnly>
  );
}
