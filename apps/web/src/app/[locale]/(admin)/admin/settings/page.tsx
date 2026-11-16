import { SettingsAdminOnly } from '../../../../../features/admin-settings/settings-admin-only';
import { SettingsPage } from '../../../../../features/admin-settings/settings-page';

/** Sistem ayarları (F2.19, US-017): yalnız süper admin. */
export default function AdminSettingsPage() {
  return (
    <SettingsAdminOnly>
      <SettingsPage />
    </SettingsAdminOnly>
  );
}
