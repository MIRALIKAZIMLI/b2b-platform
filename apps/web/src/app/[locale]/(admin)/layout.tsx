import type { ReactNode } from 'react';
import { AreaLayout } from '../../../features/shell/area-layout';

/** admin düzeni (F1.13b): menü izinden; yanlış alana gelinirse kendi açılış sayfasına. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AreaLayout area="admin">{children}</AreaLayout>;
}
