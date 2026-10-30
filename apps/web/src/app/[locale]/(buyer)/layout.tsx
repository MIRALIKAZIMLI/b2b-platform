import type { ReactNode } from 'react';
import { AreaLayout } from '../../../features/shell/area-layout';

/** buyer düzeni (F1.13b): menü izinden; yanlış alana gelinirse kendi açılış sayfasına. */
export default function BuyerLayout({ children }: { children: ReactNode }) {
  return <AreaLayout area="buyer">{children}</AreaLayout>;
}
