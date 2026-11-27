'use client';
// Ürün formundaki "Qiymətlər" kartı (F3.6b; US-034 AC1, AC5, AC6). UX kararları:
// - Yalnız kayıtlı üründe ve `pricing.view` ile görünür; form dışında kendi kaydı var (ürün formunu
//   kaydetmez). Arşivli ürün veya `pricing.manage` yok: yalnız okunur.
// - Üstte liste seçici (aktif listeler, standart önce). Liste yoksa fiyat sayfasına yönlendiren not.
// - Satırlar: aktif varyantların satış birimi olan ambalaj seviyeleri (fiyat satış birimi başına).
//   Her satırda şu anki fiyat, ileri tarihli fiyatlar (tarihiyle) ve yeni fiyat kutusu. Boş kutu =
//   değişiklik yok.
// - "Qüvvəyə minir": Dərhal / Tarixdən (gün seçici, en erken yarın). Gün toptancının saatinde 00:00;
//   bugün/geçmiş kararını sunucu verir (422 → gün alanında hata).
// - "Müştəri üçün yoxla": aktif müşteri seçilince her satırda o müşterinin fiyatı ve kaynağı
//   (`/prices/explain`). Müşteri izni (`connections.view`) yoksa bölüm görünmez.
// - F3.9: açıklamada isteğe bağlı miktar kutusu; ulaşılan kademe indirimi fiyatın yanında yeşil.
// - F3.7b: müşteri seçiliyken `pricing.manage` ile her satırda "Müştəri qiyməti" kutusu: o müşteriye
//   hemen geçerli özel fiyat yazar (ileri tarih ve kaldırma müşterinin "Xüsusi qiymətlər" sayfasında).
import {
  addDays,
  formatDate,
  formatTierDecimal,
  formatUnitPrice,
  pickLocalizedText,
  type PriceStartMode,
  priceItemsBody,
  priceItemsFieldErrors,
  normalizeDecimalInput,
  priceListFailureKey,
  priceSourceKey,
  pricingAccess,
  sortPriceLists,
  TIER_MIN_QTY_PATTERN,
} from '@b2b/shared';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { ApiError } from '../admin-sellers/api';
import { DEFAULT_TIMEZONE } from '../admin-sellers/form';
import { useConnections } from '../customers/api';
import { useShell } from '../shell/use-shell';
import type { Product, Unit } from '../products/api';
import { Button, Card, Field, SelectInput, TextInput } from '../ui/primitives';
import {
  type PriceExplanation,
  useCustomerPriceMutations,
  useListPrices,
  usePriceExplanations,
  usePriceLists,
  useSetPrices,
} from './api';

export interface PriceRow {
  readonly packagingId: string;
  readonly variantSku: string;
  readonly label: string;
}

/** Açıklama miktarı kutusu: boş = 1 (API varsayılanı), aksi eşik deseninde ve sıfırdan büyük. */
function explainQty(
  input: string,
): { kind: 'empty' } | { kind: 'invalid' } | { kind: 'ok'; value: string } {
  const value = normalizeDecimalInput(input);
  if (value === '') return { kind: 'empty' };
  return TIER_MIN_QTY_PATTERN.test(value) && /[1-9]/.test(value)
    ? { kind: 'ok', value }
    : { kind: 'invalid' };
}

/** Toptancının saat dilimindeki bugün (`YYYY-MM-DD`); yalnız gün seçicinin alt sınırı için. */
export function sellerToday(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Fiyat satırları: aktif varyantların satış birimi olan ambalaj seviyeleri (fiyat ve kademe satış
 * birimi başına). F3.9 kademe kartı da aynı satırları kullanır.
 */
export function useSalesUnitRows(product: Product, units: readonly Unit[]): PriceRow[] {
  const tProducts = useTranslations('products');
  const locale = useLocale();
  const unit = units.find((item) => item.code === product.baseUnitCode);
  const unitAbbr =
    unit === undefined
      ? product.baseUnitCode
      : (pickLocalizedText(unit.abbreviation, locale) ?? product.baseUnitCode);
  return useMemo(
    () =>
      product.variants
        .filter((variant) => variant.status === 'active')
        .flatMap((variant) =>
          variant.packaging
            .filter((item) => item.isSalesUnit)
            .map((item) => ({
              packagingId: item.id,
              variantSku: variant.sku,
              label: `${tProducts(`level.${item.level}`)} · ${item.baseQty} ${unitAbbr}`,
            })),
        ),
    [product.variants, tProducts, unitAbbr],
  );
}

/** `pricing.view` yoksa hiç çizilmez. */
export function ProductPricesCard({
  businessId,
  product,
  units,
}: {
  businessId: string | undefined;
  product: Product;
  units: readonly Unit[];
}) {
  const shell = useShell();
  const codes = (shell.me?.activeBusiness?.permissions ?? []).map((p) => p.code);
  const access = pricingAccess(codes);
  if (!access.view) return null;
  return (
    <PricesCardBody
      businessId={businessId}
      product={product}
      units={units}
      canManage={access.manage}
      canViewCustomers={codes.includes('connections.view')}
    />
  );
}

function PricesCardBody({
  businessId,
  product,
  units,
  canManage,
  canViewCustomers,
}: {
  businessId: string | undefined;
  product: Product;
  units: readonly Unit[];
  canManage: boolean;
  canViewCustomers: boolean;
}) {
  const t = useTranslations('prices');
  const tAll = useTranslations();
  const locale = useLocale();
  const shell = useShell();
  // Fiyat günü toptancının saatinde başlar (K4): tarih gösterimi ve "yarın" işletme saat diliminde.
  const sellerZone = shell.me?.activeBusiness?.timezone ?? DEFAULT_TIMEZONE;
  const formatDay = (iso: string) =>
    formatDate(iso, locale, { user: null, business: sellerZone, country: DEFAULT_TIMEZONE });
  const lists = usePriceLists(businessId);
  const active = useMemo(
    () =>
      sortPriceLists(
        (lists.data ?? []).filter((list) => list.status === 'active'),
        locale,
      ),
    [lists.data, locale],
  );
  const [chosen, setChosen] = useState<string>();
  const list = active.find((item) => item.id === chosen) ?? active[0];

  const rows = useSalesUnitRows(product, units);
  const packagingIds = useMemo(() => rows.map((row) => row.packagingId), [rows]);
  const prices = useListPrices(businessId, list?.id, packagingIds);
  const byPackaging = new Map((prices.data ?? []).map((item) => [item.packagingId, item]));

  const editable = canManage && product.status !== 'archived' && list !== undefined;
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<PriceStartMode>('now');
  const [day, setDay] = useState('');
  const [invalidRows, setInvalidRows] = useState<readonly string[]>([]);
  const [invalidDay, setInvalidDay] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string }>();
  const save = useSetPrices(businessId);
  const minDay = addDays(sellerToday(sellerZone), 1);

  const connections = useConnections(canViewCustomers ? businessId : undefined, 'active');
  const customers = (connections.data?.pages ?? []).flatMap((page) => page.items);
  const [buyerId, setBuyerId] = useState('');
  // F3.9: miktar (satış birimi) girilirse açıklama ulaşılan kademe indirimini de gösterir.
  const [qtyInput, setQtyInput] = useState('');
  const qty = explainQty(qtyInput);
  const explanations = usePriceExplanations(
    businessId,
    buyerId === '' ? undefined : buyerId,
    packagingIds,
    qty.kind === 'ok' ? qty.value : undefined,
  );

  function onSave() {
    if (list === undefined || save.isPending) return;
    setMessage(undefined);
    const sent = rows.map((row) => ({
      packagingId: row.packagingId,
      input: inputs[row.packagingId] ?? '',
    }));
    const result = priceItemsBody(sent, mode, day);
    if (!result.ok) {
      setInvalidRows(result.invalidRows);
      setInvalidDay(result.invalidDay);
      if (result.empty) setMessage({ tone: 'error', text: t('card.nothing_to_save') });
      return;
    }
    save.mutate(
      { listId: list.id, body: result.body },
      {
        onSuccess: (saved) => {
          setInputs({});
          setInvalidRows([]);
          setInvalidDay(false);
          setMessage({
            tone: 'ok',
            text:
              result.body.validFrom === undefined
                ? t('card.saved_now', { count: saved.count })
                : t('card.saved_scheduled', {
                    count: saved.count,
                    date: formatDay(saved.validFrom),
                  }),
          });
        },
        onError: (error) => {
          if (error instanceof ApiError && error.code === 'VALIDATION_FAILED') {
            const fields = priceItemsFieldErrors(error.details, result.body.items);
            setInvalidRows(fields.rows);
            setInvalidDay(fields.day);
            if (fields.rows.length > 0 || fields.day) return;
          }
          setMessage({ tone: 'error', text: tAll(priceListFailureKey(error)) });
        },
      },
    );
  }

  return (
    <Card className="space-y-6 p-6 sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-slate-900">{t('card.title')}</h2>
          <p className="text-sm text-slate-500">{t('card.description')}</p>
        </div>
        {active.length > 0 && (
          <div className="w-full sm:max-w-xs">
            <Field id="price-card-list" label={t('card.list')}>
              <SelectInput
                id="price-card-list"
                value={list?.id ?? ''}
                onChange={(event) => {
                  setChosen(event.target.value);
                  setInputs({});
                  setInvalidRows([]);
                  setMessage(undefined);
                }}
              >
                {active.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.isDefault ? t('card.list_default', { name: item.name }) : item.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>
        )}
      </div>

      {lists.isError && (
        <p role="alert" className="text-sm text-rose-700">
          {tAll(priceListFailureKey(lists.error))}
        </p>
      )}
      {lists.isSuccess && active.length === 0 && (
        <p className="rounded-2xl border border-indigo-200/70 bg-gradient-to-br from-indigo-50 to-violet-50/60 px-4 py-3 text-sm text-indigo-800">
          {t('card.no_lists')}{' '}
          <Link
            href={`/${locale}/seller/prices`}
            className="font-semibold underline decoration-indigo-300 underline-offset-2 hover:decoration-indigo-600"
          >
            {t('card.no_lists_link')}
          </Link>
        </p>
      )}
      {list !== undefined && rows.length === 0 && (
        <p className="text-sm text-slate-500">{t('card.no_sales_units')}</p>
      )}

      {list !== undefined && rows.length > 0 && (
        <>
          {list.vatIncluded ? (
            <p className="text-xs text-slate-500">
              {t('vat_included_rate', { rate: list.vatRate })} · {list.currency}
            </p>
          ) : (
            <p className="text-xs text-slate-500">
              {t('vat_excluded_rate', { rate: list.vatRate })} · {list.currency}
            </p>
          )}
          {prices.isError && (
            <p role="alert" className="text-sm text-rose-700">
              {tAll(priceListFailureKey(prices.error))}
            </p>
          )}
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200/80">
            {rows.map((row, index) => {
              const item = byPackaging.get(row.packagingId);
              const invalid = invalidRows.includes(row.packagingId);
              const inputId = `price-input-${row.packagingId}`;
              return (
                <li
                  key={row.packagingId}
                  data-testid="price-row"
                  data-packaging={row.packagingId}
                  className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_auto] sm:items-center sm:px-5"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">
                        {row.variantSku}
                      </span>
                      <span>{row.label}</span>
                    </p>
                    <p className="text-sm text-slate-500 tabular-nums" data-testid="price-current">
                      {prices.isPending
                        ? '…'
                        : item?.current === null || item === undefined
                          ? t('card.no_price')
                          : t('card.current', {
                              price: formatUnitPrice(item.current.unitPrice),
                              currency: list.currency,
                            })}
                    </p>
                    {(item?.scheduled ?? []).map((point) => (
                      <p
                        key={point.validFrom}
                        data-testid="price-scheduled"
                        className="text-xs font-medium text-violet-700 tabular-nums"
                      >
                        {t('card.scheduled', {
                          price: formatUnitPrice(point.unitPrice),
                          currency: list.currency,
                          date: formatDay(point.validFrom),
                        })}
                      </p>
                    ))}
                    {buyerId !== '' && (
                      <Explanation result={explanations[index]} currency={list.currency} />
                    )}
                    {buyerId !== '' && canManage && product.status !== 'archived' && (
                      <CustomerPriceInline
                        businessId={businessId}
                        buyerId={buyerId}
                        packagingId={row.packagingId}
                        label={`${row.variantSku} ${row.label}`}
                      />
                    )}
                  </div>
                  {editable && (
                    <div className="sm:w-40">
                      <label htmlFor={inputId} className="sr-only">
                        {t('card.new_price_for', { label: `${row.variantSku} ${row.label}` })}
                      </label>
                      <TextInput
                        id={inputId}
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder={t('card.new_price')}
                        value={inputs[row.packagingId] ?? ''}
                        invalid={invalid}
                        aria-invalid={invalid}
                        aria-describedby={invalid ? `${inputId}-error` : undefined}
                        onChange={(event) => {
                          const value = event.target.value;
                          setInputs((prev) => ({ ...prev, [row.packagingId]: value }));
                          setInvalidRows((prev) => prev.filter((id) => id !== row.packagingId));
                          setMessage(undefined);
                        }}
                      />
                      {invalid && (
                        <p
                          id={`${inputId}-error`}
                          role="alert"
                          className="mt-1 text-xs font-medium text-rose-600"
                        >
                          {t('card.invalid_price')}
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {editable && (
            <div className="flex flex-col gap-4 rounded-2xl bg-slate-50/80 p-4 sm:flex-row sm:items-end sm:justify-between">
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-slate-900">{t('card.starts')}</legend>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="inline-flex rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200/80">
                    {(['now', 'scheduled'] as const).map((value) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={mode === value}
                        data-testid={`price-mode-${value}`}
                        onClick={() => {
                          setMode(value);
                          setInvalidDay(false);
                          if (value === 'scheduled' && day === '') setDay(minDay);
                        }}
                        className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all duration-200 focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none ${
                          mode === value
                            ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200'
                            : 'text-slate-500 hover:text-slate-900'
                        }`}
                      >
                        {t(`card.mode_${value}`)}
                      </button>
                    ))}
                  </div>
                  {mode === 'scheduled' && (
                    <div className="space-y-1">
                      <label htmlFor="price-card-day" className="sr-only">
                        {t('card.day')}
                      </label>
                      <TextInput
                        id="price-card-day"
                        type="date"
                        min={minDay}
                        value={day}
                        invalid={invalidDay}
                        aria-describedby={
                          invalidDay ? 'price-card-day-error' : 'price-card-day-hint'
                        }
                        onChange={(event) => {
                          setDay(event.target.value);
                          setInvalidDay(false);
                        }}
                      />
                    </div>
                  )}
                </div>
                {mode === 'scheduled' &&
                  (invalidDay ? (
                    <p
                      id="price-card-day-error"
                      role="alert"
                      className="text-xs font-medium text-rose-600"
                    >
                      {t('card.invalid_day')}
                    </p>
                  ) : (
                    <p id="price-card-day-hint" className="text-xs text-slate-500">
                      {t('card.day_hint')}
                    </p>
                  ))}
              </fieldset>
              <Button disabled={save.isPending} onClick={onSave} data-testid="price-save">
                {save.isPending ? t('card.saving') : t('card.save')}
              </Button>
            </div>
          )}
          {message !== undefined && (
            <p
              role={message.tone === 'ok' ? 'status' : 'alert'}
              className={
                message.tone === 'ok'
                  ? 'text-sm font-medium text-emerald-600'
                  : 'rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700'
              }
            >
              {message.tone === 'ok' ? `✓ ${message.text}` : message.text}
            </p>
          )}

          {canViewCustomers && (
            <div className="space-y-3 border-t border-slate-200/80 pt-6">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-slate-900">{t('explain.title')}</h3>
                <p className="text-xs text-slate-500">{t('explain.description')}</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="w-full sm:max-w-sm">
                  <label htmlFor="price-explain-buyer" className="sr-only">
                    {t('explain.customer')}
                  </label>
                  <SelectInput
                    id="price-explain-buyer"
                    value={buyerId}
                    onChange={(event) => {
                      setBuyerId(event.target.value);
                    }}
                  >
                    <option value="">{t('explain.choose')}</option>
                    {customers.map((item) => (
                      <option key={item.id} value={item.buyerId}>
                        {item.counterpartyName ?? t('explain.unnamed')}
                      </option>
                    ))}
                  </SelectInput>
                </div>
                {connections.hasNextPage && (
                  <Button
                    variant="secondary"
                    disabled={connections.isFetchingNextPage}
                    onClick={() => void connections.fetchNextPage()}
                  >
                    {t('explain.more')}
                  </Button>
                )}
                <div className="w-full sm:w-40">
                  <label htmlFor="price-explain-qty" className="sr-only">
                    {t('explain.qty')}
                  </label>
                  <TextInput
                    id="price-explain-qty"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder={t('explain.qty_placeholder')}
                    value={qtyInput}
                    invalid={qty.kind === 'invalid'}
                    aria-invalid={qty.kind === 'invalid'}
                    aria-describedby="price-explain-qty-hint"
                    onChange={(event) => {
                      setQtyInput(event.target.value);
                    }}
                  />
                </div>
              </div>
              <p
                id="price-explain-qty-hint"
                role={qty.kind === 'invalid' ? 'alert' : undefined}
                className={
                  qty.kind === 'invalid'
                    ? 'text-xs font-medium text-rose-600'
                    : 'text-xs text-slate-500'
                }
              >
                {qty.kind === 'invalid' ? t('explain.qty_invalid') : t('explain.qty_hint')}
              </p>
              {connections.isSuccess && customers.length === 0 && (
                <p className="text-xs text-slate-500">{t('explain.no_customers')}</p>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function Explanation({
  result,
  currency,
}: {
  result:
    | {
        data?: PriceExplanation | undefined;
        isPending: boolean;
        isError: boolean;
        error: unknown;
      }
    | undefined;
  currency: string;
}) {
  const t = useTranslations('prices');
  const tAll = useTranslations();
  if (result === undefined || result.isPending) {
    return <p className="text-xs text-slate-400">…</p>;
  }
  if (result.isError || result.data === undefined) {
    return (
      <p role="alert" className="text-xs text-rose-600">
        {tAll(priceListFailureKey(result.error))}
      </p>
    );
  }
  const data = result.data;
  const source = tAll(priceSourceKey(data.source));
  return (
    <p
      data-testid="price-explain"
      data-source={data.source}
      className="inline-flex flex-wrap items-center gap-1.5 rounded-lg bg-indigo-50/70 px-2 py-1 text-xs text-indigo-800 tabular-nums"
    >
      {data.finalUnitPrice === null
        ? t('explain.none')
        : t('explain.price', {
            price: formatUnitPrice(data.finalUnitPrice.amount),
            currency: data.finalUnitPrice.currency || currency,
          })}
      {data.source !== 'none' && (
        <span className="text-indigo-600">
          ·{' '}
          {data.priceList === null
            ? source
            : t('explain.source_with_list', { source, name: data.priceList.name })}
        </span>
      )}
      {data.tierDiscountPercent !== null && (
        <span data-testid="price-explain-tier" className="font-medium text-emerald-700">
          · {t('explain.tier', { percent: formatTierDecimal(data.tierDiscountPercent) })}
        </span>
      )}
    </p>
  );
}

/** F3.7b: seçili müşteriye tek ambalaj için hemen geçerli özel fiyat (US-035 AC1). */
function CustomerPriceInline({
  businessId,
  buyerId,
  packagingId,
  label,
}: {
  businessId: string | undefined;
  buyerId: string;
  packagingId: string;
  label: string;
}) {
  const t = useTranslations('prices');
  const tAll = useTranslations();
  const { set } = useCustomerPriceMutations(businessId);
  const [value, setValue] = useState('');
  const [state, setState] = useState<{ tone: 'ok' | 'error'; text: string }>();
  const inputId = `customer-price-input-${packagingId}`;

  function save() {
    setState(undefined);
    const result = priceItemsBody([{ packagingId, input: value }], 'now', '');
    if (!result.ok) {
      setState({ tone: 'error', text: t('card.invalid_price') });
      return;
    }
    set.mutate(
      { buyerId, ...result.body },
      {
        onSuccess: () => {
          setValue('');
          setState({ tone: 'ok', text: t('customer.saved') });
        },
        onError: (error) => {
          setState({
            tone: 'error',
            text:
              error instanceof ApiError && error.code === 'VALIDATION_FAILED'
                ? t('card.invalid_price')
                : error instanceof ApiError && error.code === 'NOT_FOUND'
                  ? tAll('customerPrices.not_connected')
                  : tAll(priceListFailureKey(error)),
          });
        },
      },
    );
  }

  return (
    <div className="space-y-1 pt-1" data-testid="customer-price-inline">
      <div className="flex max-w-sm items-center gap-2">
        <label htmlFor={inputId} className="sr-only">
          {t('customer.price_for', { label })}
        </label>
        <TextInput
          id={inputId}
          inputMode="decimal"
          autoComplete="off"
          placeholder={t('customer.placeholder')}
          value={value}
          invalid={state?.tone === 'error'}
          onChange={(event) => {
            setValue(event.target.value);
            setState(undefined);
          }}
        />
        <Button variant="secondary" disabled={set.isPending || value.trim() === ''} onClick={save}>
          {set.isPending ? t('card.saving') : t('customer.save')}
        </Button>
      </div>
      {state !== undefined && (
        <p
          role={state.tone === 'ok' ? 'status' : 'alert'}
          className={
            state.tone === 'ok'
              ? 'text-xs font-medium text-emerald-600'
              : 'text-xs font-medium text-rose-600'
          }
        >
          {state.tone === 'ok' ? `✓ ${state.text}` : state.text}
        </p>
      )}
    </div>
  );
}
