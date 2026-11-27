'use client';
// Bir müşterinin özel fiyatları (F3.7b; US-035 AC1, S1 = A). UX kararları:
// - Müşteriler listesinde satırdaki "Xüsusi qiymətlər" bağlantısından açılır (`pricing.view`).
//   Başlıkta müşteri adı; sağda "Excel ilə yüklə" (S2 = A: bu müşteriye hazır şablon; `imports.run`
//   + `pricing.manage`) ve geri bağlantısı.
// - Tek kart içinde satırlar: SKU rozeti, ürün adı + ambalaj seviyesi; altında şu anki özel fiyat
//   ve ileri tarihli fiyatlar (Violet, tarihli). Para birimi standart listeden (müşteri fiyatı
//   listenin para biriminde).
// - `pricing.manage` ile satırda "Dəyiş" yerinde açılır: yeni fiyat + Dərhal / Tarixdən (en erken
//   yarın, toptancının saatinde 00:00). "Sil" önce satır içinde onay ister (tarayıcı penceresi yok);
//   silinince perakendeci yeniden liste fiyatını görür.
// - Boş: tek tek fiyatın ürün kartından ("Müştəri üçün yoxla") ya da Excel'den girildiğini anlatır.
// - Bağlantı bitmişse yazma 404 → "bağlantı yok" iletisi (S3 = A: fiyatlar kalır, okunur).
import {
  addDays,
  formatDate,
  formatUnitPrice,
  pickLocalizedText,
  type PriceStartMode,
  priceItemsBody,
  priceListFailureKey,
  pricingAccess,
} from '@b2b/shared';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { ApiError } from '../admin-sellers/api';
import { DEFAULT_TIMEZONE } from '../admin-sellers/form';
import { useConnections } from '../customers/api';
import { useShell } from '../shell/use-shell';
import { Button, Card, PageHeader, TextInput } from '../ui/primitives';
import {
  type CustomerPriceItem,
  useCustomerPriceMutations,
  useCustomerPrices,
  usePriceLists,
} from './api';
import { sellerToday } from './product-prices-card';

const linkClass =
  'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none';
const secondaryLink = `${linkClass} border border-slate-200/80 bg-white text-slate-700 shadow-sm hover:border-slate-300 hover:shadow-md`;
const primaryLink = `${linkClass} bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/20 hover:shadow-lg hover:shadow-indigo-500/30`;

/** Yazma hatası → çeviri anahtarı; 404 = bağlantı yok veya fiyat zaten silinmiş. */
function writeErrorKey(error: unknown): string {
  if (error instanceof ApiError && error.code === 'NOT_FOUND')
    return 'customerPrices.not_connected';
  return priceListFailureKey(error);
}

export function CustomerPricesPage({ buyerId }: { buyerId: string }) {
  const t = useTranslations('customerPrices');
  const tAll = useTranslations();
  const locale = useLocale();
  const shell = useShell();
  const businessId = shell.activeBusinessId;
  const codes = (shell.me?.activeBusiness?.permissions ?? []).map((p) => p.code);
  const access = pricingAccess(codes);
  const canImport = access.manage && codes.includes('imports.run');
  const prices = useCustomerPrices(access.view ? businessId : undefined, buyerId);
  const items = useMemo(
    () => prices.data?.pages.flatMap((page) => page.items) ?? [],
    [prices.data],
  );
  const connections = useConnections(
    codes.includes('connections.view') ? businessId : undefined,
    'active',
  );
  const name = (connections.data?.pages ?? [])
    .flatMap((page) => page.items)
    .find((item) => item.buyerId === buyerId)?.counterpartyName;
  const lists = usePriceLists(businessId, access.view);
  const currency =
    (lists.data ?? []).find((list) => list.isDefault && list.status === 'active')?.currency ?? '';

  const back = (
    <Link href={`/${locale}/seller/customers`} className={secondaryLink}>
      {t('back')}
    </Link>
  );

  if (shell.me !== undefined && !access.view) {
    return (
      <div className="space-y-8 px-4 py-8 sm:px-6 lg:py-10">
        <PageHeader title={t('title')} action={back} />
        <Card className="max-w-xl p-8">
          <p
            role="alert"
            className="text-sm text-slate-600"
            data-testid="customer-prices-no-access"
          >
            {t('no_access')}
          </p>
        </Card>
      </div>
    );
  }

  const importHref = `/${locale}/seller/products/import?type=customer_prices&buyerId=${buyerId}`;
  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6 lg:py-10">
      <PageHeader
        {...(name === null || name === undefined ? {} : { eyebrow: name })}
        title={t('title')}
        description={t('description')}
        action={
          <div className="flex flex-wrap gap-3">
            {back}
            {canImport && (
              <Link href={importHref} className={primaryLink} data-testid="customer-prices-import">
                {t('import')}
              </Link>
            )}
          </div>
        }
      />
      {prices.isError ? (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50/70 p-5 text-sm text-rose-700 sm:flex-row sm:items-center sm:justify-between"
        >
          <span>{tAll(priceListFailureKey(prices.error))}</span>
          <Button variant="secondary" onClick={() => void prices.refetch()}>
            {t('retry')}
          </Button>
        </div>
      ) : prices.data === undefined ? (
        <Card className="h-48 animate-pulse bg-slate-100/60">
          <span className="sr-only">{t('loading')}</span>
        </Card>
      ) : items.length === 0 ? (
        <Card className="flex flex-col items-start gap-3 bg-gradient-to-br from-white to-indigo-50/40 p-8">
          <h2 className="text-base font-semibold text-slate-900">{t('empty_title')}</h2>
          <p className="max-w-xl text-sm text-slate-500">{t('empty_body')}</p>
          {canImport && (
            <Link href={importHref} className={secondaryLink}>
              {t('import')}
            </Link>
          )}
        </Card>
      ) : (
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <ul className="divide-y divide-slate-100" data-testid="customer-prices">
              {items.map((item) => (
                <PriceRow
                  key={item.packagingId}
                  item={item}
                  buyerId={buyerId}
                  businessId={businessId}
                  currency={currency}
                  canManage={access.manage}
                />
              ))}
            </ul>
          </Card>
          {prices.hasNextPage && (
            <div className="flex justify-center">
              <Button
                variant="secondary"
                disabled={prices.isFetchingNextPage}
                onClick={() => void prices.fetchNextPage()}
              >
                {prices.isFetchingNextPage ? t('loading') : t('more')}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PriceRow({
  item,
  buyerId,
  businessId,
  currency,
  canManage,
}: {
  item: CustomerPriceItem;
  buyerId: string;
  businessId: string | undefined;
  currency: string;
  canManage: boolean;
}) {
  const t = useTranslations('customerPrices');
  const tProducts = useTranslations('products');
  const tAll = useTranslations();
  const locale = useLocale();
  const shell = useShell();
  const sellerZone = shell.me?.activeBusiness?.timezone ?? DEFAULT_TIMEZONE;
  const formatDay = (iso: string) =>
    formatDate(iso, locale, { user: null, business: sellerZone, country: DEFAULT_TIMEZONE });
  const minDay = addDays(sellerToday(sellerZone), 1);
  const { set, remove } = useCustomerPriceMutations(businessId);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [price, setPrice] = useState('');
  const [mode, setMode] = useState<PriceStartMode>('now');
  const [day, setDay] = useState('');
  const [invalid, setInvalid] = useState<{ price: boolean; day: boolean }>({
    price: false,
    day: false,
  });
  const [error, setError] = useState<string>();
  const inputId = `customer-price-${item.packagingId}`;
  const productName = pickLocalizedText(item.productName, locale) ?? item.sku;
  const money = (amount: string) => `${formatUnitPrice(amount)} ${currency}`.trim();

  function save() {
    setError(undefined);
    const result = priceItemsBody([{ packagingId: item.packagingId, input: price }], mode, day);
    if (!result.ok) {
      setInvalid({ price: result.invalidRows.length > 0 || result.empty, day: result.invalidDay });
      return;
    }
    set.mutate(
      { buyerId, ...result.body },
      {
        onSuccess: () => {
          setEditing(false);
          setPrice('');
          setMode('now');
          setInvalid({ price: false, day: false });
        },
        onError: (e) => {
          if (e instanceof ApiError && e.code === 'VALIDATION_FAILED') {
            const details = (e.details ?? {}) as Record<string, unknown>;
            const day = 'validFrom' in details;
            setInvalid({ price: !day, day });
            return;
          }
          setError(tAll(writeErrorKey(e)));
        },
      },
    );
  }

  function confirmRemove() {
    setError(undefined);
    remove.mutate(
      { buyerId, packagingId: item.packagingId },
      {
        onSuccess: () => {
          setConfirming(false);
        },
        onError: (e) => {
          setConfirming(false);
          setError(tAll(writeErrorKey(e)));
        },
      },
    );
  }

  return (
    <li
      data-testid="customer-price-row"
      data-packaging={item.packagingId}
      className="space-y-4 px-6 py-5 transition-colors duration-200 hover:bg-slate-50/70"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">
              {item.sku}
            </span>
            <span className="truncate">{productName}</span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-500">{tProducts(`level.${item.packagingLevel}`)}</span>
          </p>
          <p className="text-sm text-slate-600 tabular-nums" data-testid="customer-price-current">
            {item.current === null
              ? t('no_current')
              : t('current', {
                  price: money(item.current.unitPrice),
                  date: formatDay(item.current.validFrom),
                })}
          </p>
          {item.scheduled.map((point) => (
            <p
              key={point.validFrom}
              data-testid="customer-price-scheduled"
              className="text-xs font-medium text-violet-700 tabular-nums"
            >
              {t('scheduled', { price: money(point.unitPrice), date: formatDay(point.validFrom) })}
            </p>
          ))}
        </div>
        {canManage && !editing && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {confirming ? (
              <>
                <span className="self-center text-sm text-slate-600">{t('remove_confirm')}</span>
                <Button
                  variant="danger"
                  disabled={remove.isPending}
                  onClick={confirmRemove}
                  data-testid="customer-price-remove-confirm"
                >
                  {remove.isPending ? t('removing') : t('remove_yes')}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setConfirming(false);
                  }}
                >
                  {t('cancel')}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setEditing(true);
                    setError(undefined);
                  }}
                >
                  {t('edit')}
                </Button>
                <Button
                  variant="quiet-danger"
                  onClick={() => {
                    setConfirming(true);
                    setError(undefined);
                  }}
                >
                  {t('remove')}
                </Button>
              </>
            )}
          </div>
        )}
      </div>
      {editing && (
        <div className="flex flex-col gap-4 rounded-2xl bg-slate-50/80 p-4 lg:flex-row lg:items-end">
          <div className="space-y-1 lg:w-44">
            <label htmlFor={inputId} className="text-xs font-medium text-slate-600">
              {t('new_price')}
            </label>
            <TextInput
              id={inputId}
              inputMode="decimal"
              autoComplete="off"
              value={price}
              invalid={invalid.price}
              aria-invalid={invalid.price}
              onChange={(event) => {
                setPrice(event.target.value);
                setInvalid((prev) => ({ ...prev, price: false }));
              }}
            />
            {invalid.price && (
              <p role="alert" className="text-xs font-medium text-rose-600">
                {t('invalid_price')}
              </p>
            )}
          </div>
          <fieldset className="space-y-1">
            <legend className="text-xs font-medium text-slate-600">{t('starts')}</legend>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="inline-flex rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200/80">
                {(['now', 'scheduled'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={mode === value}
                    onClick={() => {
                      setMode(value);
                      setInvalid((prev) => ({ ...prev, day: false }));
                      if (value === 'scheduled' && day === '') setDay(minDay);
                    }}
                    className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all duration-200 focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none ${
                      mode === value
                        ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    {t(`mode_${value}`)}
                  </button>
                ))}
              </div>
              {mode === 'scheduled' && (
                <div>
                  <label htmlFor={`${inputId}-day`} className="sr-only">
                    {t('day')}
                  </label>
                  <TextInput
                    id={`${inputId}-day`}
                    type="date"
                    min={minDay}
                    value={day}
                    invalid={invalid.day}
                    onChange={(event) => {
                      setDay(event.target.value);
                      setInvalid((prev) => ({ ...prev, day: false }));
                    }}
                  />
                </div>
              )}
            </div>
            {invalid.day && (
              <p role="alert" className="text-xs font-medium text-rose-600">
                {t('invalid_day')}
              </p>
            )}
          </fieldset>
          <div className="flex gap-2 lg:ml-auto">
            <Button
              variant="secondary"
              onClick={() => {
                setEditing(false);
                setInvalid({ price: false, day: false });
              }}
            >
              {t('cancel')}
            </Button>
            <Button disabled={set.isPending} onClick={save} data-testid="customer-price-save">
              {set.isPending ? t('saving') : t('save')}
            </Button>
          </div>
        </div>
      )}
      {error !== undefined && (
        <p role="alert" className="text-sm text-rose-700">
          {error}
        </p>
      )}
    </li>
  );
}
