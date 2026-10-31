'use client';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { type ShellArea, visibleMenu } from './menu';

/** İzinden (platform alanında platform rolünden) oluşan menü (F1.13-AC5, F2.1b-AC5). Yapılmamış ekranlar bağlantısız. */
export function ShellMenu({
  area,
  permissions,
  platformRole,
}: {
  area: ShellArea;
  permissions: readonly string[];
  platformRole: string | null;
}) {
  const t = useTranslations('shell');
  const locale = useLocale();
  return (
    <nav aria-label={t('menu_label')}>
      <ul>
        {visibleMenu(area, permissions, platformRole).map((item) => (
          <li key={item.key} data-menu-item={item.key}>
            {item.ready ? (
              <Link href={`/${locale}/${area}${item.path === undefined ? '' : `/${item.path}`}`}>
                {t(`menu.${item.key}`)}
              </Link>
            ) : (
              <span aria-disabled="true">{t(`menu.${item.key}`)}</span>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
