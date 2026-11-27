'use client';
// Ürün formundaki "Pilləli endirim" kartı (F3.9; US-037 AC1; kullanıcı kararları S1 = A, S2 = A).
// UX kararları:
// - Fiyat kartının altında, ayrı kart; yalnız kayıtlı üründe ve `pricing.view` ile görünür. Arşivli
//   ürün veya `pricing.manage` yok: yalnız okunur (kademeler "10+ → −3%" çipleri).
// - Satırlar fiyat kartıyla aynı: aktif varyantların satış birimi ambalajları. Her ambalajın kendi
//   kademe listesi ve kendi "Yadda saxla" düğmesi var (PUT bir ambalajın bütün kademelerini yazar).
// - Kademe satırı: eşik ("… və çox") + yüzde; "×" satırı siler; "Pillə əlavə et" ayardaki sınıra
//   (`maxPerPackaging`) kadar. Bütün satırlar silinip kaydedilirse kademeler kaldırılır.
// - Kurallar istemcide de denetlenir (eşik > 1, tekrarsız, 0 < % < 100, eşik büyüdükçe % büyür);
//   sunucu 422'si aynı satıra iner. Kademe bütün müşterilere uygulanır; seçilen fiyatın üzerine gelir.
import {
  formatTierDecimal,
  pricingAccess,
  type TierFormError,
  type TierFormRow,
  tierPricesBody,
  tierPricesFieldErrors,
  priceListFailureKey,
} from '@b2b/shared';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { ApiError } from '../admin-sellers/api';
import type { Product, Unit } from '../products/api';
import { useShell } from '../shell/use-shell';
import { Button, Card, TextInput } from '../ui/primitives';
import { type PackagingTiers, useSetTierPrices, useTierPrices } from './api';
import { type PriceRow, useSalesUnitRows } from './product-prices-card';

/** `pricing.view` yoksa hiç çizilmez. */
export function ProductTierPricesCard({
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
    <TierCardBody
      businessId={businessId}
      product={product}
      units={units}
      editable={access.manage && product.status !== 'archived'}
    />
  );
}

function TierCardBody({
  businessId,
  product,
  units,
  editable,
}: {
  businessId: string | undefined;
  product: Product;
  units: readonly Unit[];
  editable: boolean;
}) {
  const t = useTranslations('prices.tiers');
  const tAll = useTranslations();
  const rows = useSalesUnitRows(product, units);
  const packagingIds = useMemo(() => rows.map((row) => row.packagingId), [rows]);
  const tiers = useTierPrices(businessId, packagingIds);
  const byPackaging = new Map((tiers.data?.items ?? []).map((item) => [item.packagingId, item]));

  return (
    <Card className="space-y-6 p-6 sm:p-8">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-slate-900">{t('title')}</h2>
        <p className="text-sm text-slate-500">{t('description')}</p>
      </div>
      {rows.length === 0 && <p className="text-sm text-slate-500">{t('no_sales_units')}</p>}
      {tiers.isError && (
        <p role="alert" className="text-sm text-rose-700">
          {tAll(priceListFailureKey(tiers.error))}
        </p>
      )}
      {tiers.isPending && rows.length > 0 && <p className="text-sm text-slate-400">…</p>}
      {tiers.isSuccess && rows.length > 0 && (
        <ul className="space-y-4">
          {rows.map((row) => {
            const saved = byPackaging.get(row.packagingId);
            return (
              <li
                key={row.packagingId}
                data-testid="tier-packaging"
                data-packaging={row.packagingId}
                className="rounded-2xl border border-slate-200/80 p-4 sm:p-5"
              >
                {editable ? (
                  <TierEditor
                    key={row.packagingId}
                    businessId={businessId}
                    row={row}
                    saved={saved}
                    max={tiers.data.maxPerPackaging}
                  />
                ) : (
                  <TierSummary row={row} saved={saved} />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function RowTitle({ row }: { row: PriceRow }) {
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">
        {row.variantSku}
      </span>
      <span>{row.label}</span>
    </p>
  );
}

function TierSummary({ row, saved }: { row: PriceRow; saved: PackagingTiers | undefined }) {
  const t = useTranslations('prices.tiers');
  const list = saved?.tiers ?? [];
  return (
    <div className="space-y-2">
      <RowTitle row={row} />
      {list.length === 0 ? (
        <p className="text-sm text-slate-500">{t('none')}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {list.map((tier) => (
            <li
              key={tier.minQty}
              data-testid="tier-chip"
              className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 tabular-nums ring-1 ring-emerald-600/20 ring-inset"
            >
              {t('chip', {
                qty: formatTierDecimal(tier.minQty),
                percent: formatTierDecimal(tier.discountPercent),
              })}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface EditRow extends TierFormRow {
  readonly id: number;
}

function toEditRows(
  tiers: readonly { minQty: string; discountPercent: string }[],
  firstId: number,
): EditRow[] {
  return tiers.map((tier, index) => ({
    id: firstId + index,
    minQty: formatTierDecimal(tier.minQty),
    discountPercent: formatTierDecimal(tier.discountPercent),
  }));
}

function TierEditor({
  businessId,
  row,
  saved,
  max,
}: {
  businessId: string | undefined;
  row: PriceRow;
  saved: PackagingTiers | undefined;
  max: number;
}) {
  const t = useTranslations('prices.tiers');
  const tAll = useTranslations();
  const save = useSetTierPrices(businessId);
  const initial = toEditRows(saved?.tiers ?? [], 0);
  const [items, setItems] = useState<EditRow[]>(initial);
  const [nextId, setNextId] = useState(initial.length);
  const [errors, setErrors] = useState<ReadonlyMap<string, TierFormError>>(new Map());
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string }>();

  function update(index: number, field: 'minQty' | 'discountPercent', value: string) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
    setErrors(new Map());
    setMessage(undefined);
  }

  function onSave() {
    if (save.isPending) return;
    setMessage(undefined);
    const result = tierPricesBody(items);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    // Formdaki hangi satırın gönderildiği (boş satırlar atlanır): sunucu hatasını satıra indirmek için.
    const sentRows = items.flatMap((item, index) =>
      item.minQty.trim() === '' && item.discountPercent.trim() === '' ? [] : [index],
    );
    if (result.tiers.length > max) {
      setMessage({ tone: 'error', text: t('too_many', { max }) });
      return;
    }
    save.mutate(
      { packagingId: row.packagingId, tiers: [...result.tiers] },
      {
        onSuccess: (body) => {
          // Sunucunun sıraladığı ve biçimlediği değerlerle yeniden başla (eşik artan).
          setItems(toEditRows(body.tiers, nextId));
          setNextId((value) => value + body.tiers.length);
          setMessage({
            tone: 'ok',
            text: body.tiers.length === 0 ? t('removed') : t('saved', { count: body.tiers.length }),
          });
        },
        onError: (error) => {
          if (error instanceof ApiError && error.code === 'VALIDATION_FAILED') {
            const mapped = tierPricesFieldErrors(error.details, sentRows);
            if (mapped.fields.size > 0) {
              setErrors(mapped.fields);
              return;
            }
            if (mapped.limit) {
              setMessage({ tone: 'error', text: t('too_many', { max }) });
              return;
            }
          }
          setMessage({ tone: 'error', text: tAll(priceListFailureKey(error)) });
        },
      },
    );
  }

  const full = items.length >= max;
  return (
    <div className="space-y-4">
      <RowTitle row={row} />
      {items.length === 0 && <p className="text-sm text-slate-500">{t('none')}</p>}
      {items.length > 0 && (
        <ul className="space-y-3">
          {items.map((item, index) => {
            const qtyId = `tier-qty-${row.packagingId}-${String(item.id)}`;
            const pctId = `tier-pct-${row.packagingId}-${String(item.id)}`;
            const qtyError = errors.get(`${String(index)}.minQty`);
            const pctError = errors.get(`${String(index)}.discountPercent`);
            return (
              <li key={item.id} data-testid="tier-row" className="space-y-1">
                <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                  <label htmlFor={qtyId} className="sr-only">
                    {t('min_qty_for', { label: `${row.variantSku} ${row.label}` })}
                  </label>
                  <div className="w-28">
                    <TextInput
                      id={qtyId}
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="10"
                      value={item.minQty}
                      invalid={qtyError !== undefined}
                      aria-invalid={qtyError !== undefined}
                      aria-describedby={qtyError === undefined ? undefined : `${qtyId}-error`}
                      onChange={(event) => {
                        update(index, 'minQty', event.target.value);
                      }}
                    />
                  </div>
                  <span className="text-sm text-slate-500">{t('and_more')}</span>
                  <span aria-hidden className="text-slate-300">
                    →
                  </span>
                  <label htmlFor={pctId} className="sr-only">
                    {t('percent_for', { label: `${row.variantSku} ${row.label}` })}
                  </label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-slate-500">−</span>
                    <div className="w-24">
                      <TextInput
                        id={pctId}
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="3"
                        value={item.discountPercent}
                        invalid={pctError !== undefined}
                        aria-invalid={pctError !== undefined}
                        aria-describedby={pctError === undefined ? undefined : `${pctId}-error`}
                        onChange={(event) => {
                          update(index, 'discountPercent', event.target.value);
                        }}
                      />
                    </div>
                    <span className="text-sm font-medium text-slate-500">%</span>
                  </div>
                  <Button
                    variant="quiet-danger"
                    className="px-2.5"
                    aria-label={t('remove_row')}
                    data-testid="tier-remove"
                    onClick={() => {
                      setItems((prev) => prev.filter((_, i) => i !== index));
                      setErrors(new Map());
                      setMessage(undefined);
                    }}
                  >
                    ×
                  </Button>
                </div>
                {qtyError !== undefined && (
                  <p
                    id={`${qtyId}-error`}
                    role="alert"
                    className="text-xs font-medium text-rose-600"
                  >
                    {t(`error.${qtyError}`)}
                  </p>
                )}
                {pctError !== undefined && (
                  <p
                    id={`${pctId}-error`}
                    role="alert"
                    className="text-xs font-medium text-rose-600"
                  >
                    {t(`error.${pctError}`)}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            disabled={full}
            data-testid="tier-add"
            onClick={() => {
              setItems((prev) => [...prev, { id: nextId, minQty: '', discountPercent: '' }]);
              setNextId((value) => value + 1);
              setMessage(undefined);
            }}
          >
            + {t('add')}
          </Button>
          <span className="text-xs text-slate-500">{t('limit_hint', { max })}</span>
        </div>
        <Button disabled={save.isPending} onClick={onSave} data-testid="tier-save">
          {save.isPending ? t('saving') : t('save')}
        </Button>
      </div>
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
    </div>
  );
}
