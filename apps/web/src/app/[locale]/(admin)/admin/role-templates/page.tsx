import { CatalogAdminOnly } from '../../../../../features/admin-catalog/catalog-admin-only';
import { RoleTemplatesPage } from '../../../../../features/admin-catalog/role-templates-page';

/** Rol şablonları (F2.9b, US-012): yalnız super_admin ve content (V1). */
export default function AdminRoleTemplatesPage() {
  return (
    <CatalogAdminOnly>
      <RoleTemplatesPage />
    </CatalogAdminOnly>
  );
}
