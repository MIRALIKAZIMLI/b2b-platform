import { CatalogAdminOnly } from '../../../../../features/admin-catalog/catalog-admin-only';
import { CategoriesPage } from '../../../../../features/admin-taxonomy/categories-page';

/** F3.2b (US-029): yalnız super_admin ve content (F3.2a uçlarıyla aynı roller). */
export default function AdminCategoriesPage() {
  return (
    <CatalogAdminOnly>
      <CategoriesPage />
    </CatalogAdminOnly>
  );
}
