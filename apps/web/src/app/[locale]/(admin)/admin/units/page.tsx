import { CatalogAdminOnly } from '../../../../../features/admin-catalog/catalog-admin-only';
import { UnitsPage } from '../../../../../features/admin-units/units-page';

/** Birimler (F3.1, US-028): yalnız super_admin ve content (F2.9 V1 ile aynı). */
export default function AdminUnitsPage() {
  return (
    <CatalogAdminOnly>
      <UnitsPage />
    </CatalogAdminOnly>
  );
}
