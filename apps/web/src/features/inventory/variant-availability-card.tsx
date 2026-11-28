'use client';
// Ürün formundaki "Stok vəziyyəti" kartı (F3.10; US-038 AC2). UX kararları:
// - Fiyat kartlarının altında ayrı kart; yalnız kayıtlı üründe, `inventory.view` ile ve stok modu
//   `availability` iken görünür (`none` modunda işaret perakendeciyi etkilemez, kart çizilmez).
// - Her aktif varyant bir satır: SKU + özellikler, sağda "Var / Yoxdur" anahtarı. Anahtar anında
//   kaydeder (ayrı "Yadda saxla" yok); istek sürerken satır kilitli, hata satırın altına iner.
// - `inventory.manage` yoksa veya ürün arşivliyse anahtar yerine durum etiketi (yalnız okunur).
// - "Yoxdur" varyant perakendecide "Stokda yoxdur" görünür ve səbətə əlavə edilə bilməz (F3.12a, F4.1).
import { inventoryAccess, isErrorCode } from '@b2b/shared';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiError } from '../admin-sellers/api';
import type { Product } from '../products/api';
import { useShell } from '../shell/use-shell';
import { Badge, Card } from '../ui/primitives';
import { useSetVariantAvailability, useStockMode } from './api';

/** `inventory.view` yoksa veya mod `availability` değilse hiç çizilmez. */
export function VariantAvailabilityCard({
  businessId,
  product,
}: {
  businessId: string | undefined;
  product: Product;
}) {
  const shell = useShell();
  const access = inventoryAccess((shell.me?.activeBusiness?.permissions ?? []).map((p) => p.code));
  const mode = useStockMode(businessId, access.view);
  if (!access.view || mode.data !== 'availability') return null;
  return (
    <CardBody
      businessId={businessId}
      product={product}
      editable={access.manage && product.status !== 'archived'}
    />
  );
}

function attributesLabel(attributes: Record<string, unknown>): string {
  return Object.entries(attributes)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(' · ');
}

function CardBody({
  businessId,
  product,
  editable,
}: {
  businessId: string | undefined;
  product: Product;
  editable: boolean;
}) {
  const t = useTranslations('inventory.availability');
  const tErrors = useTranslations('errors');
  const mutation = useSetVariantAvailability(businessId, product.id);
  const [pending, setPending] = useState<string | undefined>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const variants = product.variants.filter((variant) => variant.status === 'active');

  function toggle(variantId: string, isAvailable: boolean) {
    setPending(variantId);
    setErrors((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([id]) => id !== variantId)),
    );
    mutation.mutate(
      { variantId, isAvailable },
      {
        onError: (error) => {
          const code =
            error instanceof ApiError && isErrorCode(error.code) ? error.code : 'INTERNAL_ERROR';
          setErrors((prev) => ({ ...prev, [variantId]: tErrors(code) }));
        },
        onSettled: () => {
          setPending(undefined);
        },
      },
    );
  }

  return (
    <Card className="space-y-6 p-6 sm:p-8">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-slate-900">{t('title')}</h2>
        <p className="text-sm text-slate-500">{t('description')}</p>
      </div>
      <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200/80">
        {variants.map((variant) => {
          const label = attributesLabel(variant.attributes);
          const busy = pending === variant.id;
          const error = errors[variant.id];
          return (
            <li
              key={variant.id}
              data-testid="availability-row"
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 transition-colors duration-200 hover:bg-slate-50/70"
            >
              <div className="min-w-0 space-y-0.5">
                <p className="truncate font-mono text-sm font-medium text-slate-900">
                  {variant.sku}
                </p>
                {label !== '' && <p className="truncate text-xs text-slate-500">{label}</p>}
                {error !== undefined && (
                  <p role="alert" className="text-xs font-medium text-rose-600">
                    {error}
                  </p>
                )}
              </div>
              {editable ? (
                <button
                  type="button"
                  role="switch"
                  aria-checked={variant.isAvailable}
                  aria-label={t('switch_label', { sku: variant.sku })}
                  data-testid="availability-switch"
                  disabled={busy}
                  onClick={() => {
                    toggle(variant.id, !variant.isAvailable);
                  }}
                  className={`inline-flex items-center gap-2.5 rounded-full border px-1 py-1 pr-3 text-xs font-semibold transition-all duration-200 focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none disabled:cursor-wait disabled:opacity-60 ${
                    variant.isAvailable
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300'
                      : 'border-slate-200 bg-slate-100 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`h-5 w-5 rounded-full shadow-sm transition-colors duration-200 ${
                      variant.isAvailable ? 'bg-emerald-500' : 'bg-white ring-1 ring-slate-300'
                    }`}
                  />
                  {variant.isAvailable ? t('in_stock') : t('out_of_stock')}
                </button>
              ) : (
                <Badge tone={variant.isAvailable ? 'emerald' : 'slate'}>
                  {variant.isAvailable ? t('in_stock') : t('out_of_stock')}
                </Badge>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-slate-500">{t('buyer_hint')}</p>
    </Card>
  );
}
