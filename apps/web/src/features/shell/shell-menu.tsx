'use client';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { type ShellArea, visibleMenu } from './menu';

/** İzinden oluşan menü (F1.13-AC5). Yapılmamış ekranlar bağlantısız (F2+). */
export function ShellMenu({
  area,
  permissions,
}: {
  area: ShellArea;
  permissions: readonly string[];
}) {
  const t = useTranslations('shell');
  const locale = useLocale();
  return (
    <nav aria-label={t('menu_label')}>
      <ul>
        {visibleMenu(area, permissions).map((item) => (
          <li key={item.key} data-menu-item={item.key}>
            {item.ready ? (
              <Link href={`/${locale}/${area}`}>{t(`menu.${item.key}`)}</Link>
            ) : (
              <span aria-disabled="true">{t(`menu.${item.key}`)}</span>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
