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
  const base =
    'flex items-center whitespace-nowrap rounded-xl px-3.5 py-2 text-sm transition-all duration-200';
  return (
    <nav
      aria-label={t('menu_label')}
      className="shrink-0 overflow-x-auto px-4 py-3 sm:px-6 lg:w-64 lg:overflow-visible lg:py-8"
    >
      <ul className="flex gap-1 lg:flex-col">
        {visibleMenu(area, permissions, platformRole).map((item) => (
          <li key={item.key} data-menu-item={item.key}>
            {item.ready ? (
              <Link
                href={`/${locale}/${area}${item.path === undefined ? '' : `/${item.path}`}`}
                className={`${base} font-medium text-slate-700 hover:bg-white hover:text-slate-900 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none`}
              >
                {t(`menu.${item.key}`)}
              </Link>
            ) : (
              <span aria-disabled="true" className={`${base} cursor-not-allowed text-slate-400`}>
                {t(`menu.${item.key}`)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
