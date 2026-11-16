import { CatalogAdminOnly } from '../../../../../features/admin-catalog/catalog-admin-only';
import { BrandsPage } from '../../../../../features/admin-taxonomy/brands-page';

/** F3.2b (US-029): yalnız super_admin ve content (F3.2a uçlarıyla aynı roller). */
export default function AdminBrandsPage() {
  return (
    <CatalogAdminOnly>
      <BrandsPage />
    </CatalogAdminOnly>
  );
}
