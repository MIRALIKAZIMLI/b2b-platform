'use client';
// Toptancının ürünleri (F3.3b, US-030). UX kararları:
// - Başlık + "Yeni məhsul" (yalnız `catalog.manage`); altında durum sekmeleri (Hamısı / Qaralama /
//   Satışda / Arxiv) ve arama (SKU öneki veya ad, 300 ms gecikmeli).
// - Tek kartta satırlar: kullanıcının dilinde ad (US-030 AC4), SKU (mono), marka · kategori yolu,
//   aktif varyant sayısı, durum rozeti, son güncelleme. Satırın tamamı detaya bağlantı.
// - Boş: sekmeye/aramaya göre metin; yükleniyor = iskelet; hata = yeniden dene. "Daha çox" imleçle.
import {
  categoryOptions,
  PRODUCT_NAME_MAX,
  type ProductStatus,
  pickLocalizedText,
  productsAccess,
} from '@b2b/shared';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { useFormatDay } from '../admin-buyers/use-format';
import { errorCodeOf } from '../../lib/error-code';
import { LoadFailed } from '../seller-settings/status';
import { useShell } from '../shell/use-shell';
import { Badge, Button, Card, PageHeader, TextInput } from '../ui/primitives';
import { type ProductListItem, useCategories, useProducts } from './api';

const TABS = ['all', 'draft', 'active', 'archived'] as const;
type Tab = (typeof TABS)[number];

export function StatusBadge({ status }: { status: ProductStatus }) {
  const t = useTranslations('products');
  const tone = status === 'active' ? 'emerald' : status === 'draft' ? 'amber' : 'slate';
  return <Badge tone={tone}>{t(`status.${status}`)}</Badge>;
}

export function ProductsPage() {
  const t = useTranslations('products');
  const tErrors = useTranslations('errors');
  const locale = useLocale();
  const formatDay = useFormatDay();
  const shell = useShell();
  const businessId = shell.activeBusinessId;
  const access = productsAccess((shell.me?.activeBusiness?.permissions ?? []).map((p) => p.code));
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const products = useProducts(businessId, tab === 'all' ? undefined : tab, query);
  const categories = useCategories();

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim().slice(0, PRODUCT_NAME_MAX));
    }, 300);
    return () => {
      clearTimeout(timer);
    };
  }, [search]);

  const categoryLabel = useMemo(
    () =>
      new Map(
        categoryOptions(categories.data ?? [], locale, undefined).map((o) => [o.id, o.label]),
      ),
    [categories.data, locale],
  );
  const items = products.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6 lg:py-12">
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description')}
        action={
          access.manage ? (
            <Link
              href={`/${locale}/seller/products/new`}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-500/20 transition-all duration-200 hover:shadow-lg hover:shadow-indigo-500/30 focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none"
            >
              {t('create_open')}
            </Link>
          ) : undefined
        }
      />
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-slate-200/80 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div
            role="tablist"
            aria-label={t('tabs_label')}
            className="inline-flex w-full overflow-x-auto rounded-xl bg-slate-100/80 p-1 sm:w-auto"
          >
            {TABS.map((key) => {
              const selected = key === tab;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  data-testid={`product-tab-${key}`}
                  onClick={() => {
                    setTab(key);
                  }}
                  className={`flex-1 rounded-lg px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-all duration-200 focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none sm:flex-none ${
                    selected
                      ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {t(`tab.${key}`)}
                </button>
              );
            })}
          </div>
          <div className="w-full lg:max-w-xs">
            <label htmlFor="product-search" className="sr-only">
              {t('search_label')}
            </label>
            <TextInput
              id="product-search"
              type="search"
              autoComplete="off"
              maxLength={PRODUCT_NAME_MAX}
              placeholder={t('search_placeholder')}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
              }}
            />
          </div>
        </div>
        {products.isPending && (
          <ul aria-busy="true" className="divide-y divide-slate-100">
            {[0, 1, 2].map((key) => (
              <li key={key} className="space-y-2 px-6 py-5">
                <div className="h-4 w-1/3 animate-pulse rounded-lg bg-slate-100" />
                <div className="h-3 w-1/2 animate-pulse rounded-lg bg-slate-100" />
              </li>
            ))}
          </ul>
        )}
        {products.isError &&
          (errorCodeOf(products.error) === 'INTERNAL_ERROR' ? (
            <div className="p-6">
              <LoadFailed onRetry={() => void products.refetch()} />
            </div>
          ) : (
            <p role="alert" className="px-6 py-10 text-center text-sm text-rose-700">
              {tErrors(errorCodeOf(products.error))}
            </p>
          ))}
        {products.isSuccess &&
          (items.length === 0 ? (
            <div className="space-y-2 px-6 py-14 text-center">
              <p className="text-sm font-medium text-slate-900">
                {query === '' ? t(`empty.${tab}`) : t('no_match')}
              </p>
              {query === '' && tab === 'all' && access.manage && (
                <p className="text-sm text-slate-500">{t('empty_hint')}</p>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.map((item) => (
                <ProductRow
                  key={item.id}
                  item={item}
                  href={`/${locale}/seller/products/${item.id}`}
                  name={pickLocalizedText(item.name, locale) ?? item.sku}
                  category={categoryLabel.get(item.categoryId)}
                  updated={formatDay(item.updatedAt)}
                />
              ))}
            </ul>
          ))}
        {products.hasNextPage && (
          <div className="border-t border-slate-200/80 px-6 py-4 text-center">
            <Button
              variant="secondary"
              disabled={products.isFetchingNextPage}
              onClick={() => void products.fetchNextPage()}
            >
              {t('load_more')}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

function ProductRow({
  item,
  href,
  name,
  category,
  updated,
}: {
  item: ProductListItem;
  href: string;
  name: string;
  category: string | undefined;
  updated: string;
}) {
  const t = useTranslations('products');
  return (
    <li data-testid="product-row" data-sku={item.sku}>
      <Link
        href={href}
        className="group flex flex-col gap-3 px-6 py-5 transition-colors duration-200 hover:bg-slate-50/70 focus-visible:bg-slate-50 focus-visible:outline-none lg:flex-row lg:items-center lg:justify-between"
      >
        <div className="flex min-w-0 items-center gap-4">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-slate-100 shadow-sm">
            {item.thumbUrl !== null && (
              // F3.4b: kapak görselinin 200 px kopyası (dış depo adresi).
              <img src={item.thumbUrl} alt="" className="h-full w-full object-cover" />
            )}
          </div>
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-base font-semibold break-words text-slate-900 group-hover:text-indigo-700">
                {name}
              </p>
              <StatusBadge status={item.status} />
            </div>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">
                {item.sku}
              </span>
              {item.brand !== null && <span>{item.brand.name}</span>}
              {category !== undefined && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="break-words">{category}</span>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-4 text-sm text-slate-500 tabular-nums">
          <span>{t('variant_count', { count: item.activeVariantCount })}</span>
          <span className="text-slate-300">·</span>
          <span>{t('updated_on', { date: updated })}</span>
        </div>
      </Link>
    </li>
  );
}
