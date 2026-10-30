import type { ReactNode } from 'react';
import { AreaLayout } from '../../../features/shell/area-layout';

/** seller düzeni (F1.13b): menü izinden; yanlış alana gelinirse kendi açılış sayfasına. */
export default function SellerLayout({ children }: { children: ReactNode }) {
  return <AreaLayout area="seller">{children}</AreaLayout>;
}
