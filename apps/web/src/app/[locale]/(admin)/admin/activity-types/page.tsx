import { CatalogAdminOnly } from '../../../../../features/admin-catalog/catalog-admin-only';
import { ActivityTypesPage } from '../../../../../features/admin-taxonomy/activity-types-page';

/** F3.2b (US-029): yalnız super_admin ve content (F3.2a uçlarıyla aynı roller). */
export default function AdminActivityTypesPage() {
  return (
    <CatalogAdminOnly>
      <ActivityTypesPage />
    </CatalogAdminOnly>
  );
}
