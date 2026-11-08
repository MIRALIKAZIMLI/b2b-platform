import { CatalogAdminOnly } from '../../../../../features/admin-catalog/catalog-admin-only';
import { JobTitlesPage } from '../../../../../features/admin-catalog/job-titles-page';

/** Unvanlar (F2.9b, US-012): yalnız super_admin ve content (V1). */
export default function AdminJobTitlesPage() {
  return (
    <CatalogAdminOnly>
      <JobTitlesPage />
    </CatalogAdminOnly>
  );
}
