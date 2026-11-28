'use client';
// Mal girişi ve sayım penceresi (F3.11b; US-039 AC1, AC7; S1 = A). UX kararları:
// - Miktar + birim seçici (varyantın ambalajları; varsayılan "koli"). Sunucuya her zaman temel birim
//   gider (`toBaseQty`, 3 ondalığı aşan sonuç alan hatası; K2).
// - Sayımda "Rafta saydığınız toplam"; altında şimdiki miktar ve fark önizlemesi. Fark 0 ise not.
// - Mal girişinde parti no, son kullanma tarihi, not (isteğe bağlı); sayımda yalnız not.
// - `Idempotency-Key` pencere açılınca bir kez üretilir: çift tıklama / yeniden deneme tek hareket.
// - Hata: doğrulama ve `STOCK_INSUFFICIENT` miktar alanına; diğerleri pencere altında.
import {
  countDelta,
  pickLocalizedText,
  STOCK_LOT_NO_MAX,
  STOCK_NOTE_MAX,
  toBaseQty,
  trimQty,
} from '@b2b/shared';
import { useLocale, useTranslations } from 'next-intl';
import { type SyntheticEvent, useId, useState } from 'react';
import { ApiError } from '../admin-sellers/api';
import { Dialog } from '../ui/dialog';
import { Button, Field, SelectInput, TextArea, TextInput } from '../ui/primitives';
import { type StockItem, useRecordMovement } from './api';
import { useQtyText, useSignedQtyText, useUnitAbbr } from './stock-qty';

interface Props {
  readonly businessId: string | undefined;
  readonly warehouseId: string;
  readonly item: StockItem;
  readonly type: 'receipt' | 'adjustment';
  readonly onClose: () => void;
  readonly onDone: (note: string) => void;
}

const BASE = 'base';

export function MovementDialog({ businessId, warehouseId, item, type, onClose, onDone }: Props) {
  const t = useTranslations('stock');
  const tErrors = useTranslations('errors');
  const locale = useLocale();
  const abbr = useUnitAbbr();
  const qtyText = useQtyText();
  const signed = useSignedQtyText();
  const id = useId();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const record = useRecordMovement(businessId, idempotencyKey);
  const packs = item.packaging.filter((p) => trimQty(p.baseQty) !== '1');
  const [unit, setUnit] = useState<string>(
    packs.find((p) => p.unitCode === item.displayUnit?.unitCode)?.level ?? BASE,
  );
  const [qty, setQty] = useState('');
  const [lotNo, setLotNo] = useState('');
  const [expiry, setExpiry] = useState('');
  const [note, setNote] = useState('');
  const [qtyError, setQtyError] = useState<string>();
  const [general, setGeneral] = useState<string>();

  const perUnit = packs.find((p) => p.level === unit)?.baseQty ?? '1';
  const baseQty = qty.trim() === '' ? null : toBaseQty(qty, perUnit);
  const current = item.onHand ?? '0';
  const delta = type === 'adjustment' && baseQty !== null ? countDelta(baseQty, current) : null;
  const title = t(`dialog.${type}.title`);
  const product = pickLocalizedText(item.productName, locale) ?? item.sku;

  function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setGeneral(undefined);
    setQtyError(undefined);
    if (baseQty === null || (type === 'receipt' && trimQty(baseQty) === '0')) {
      setQtyError(t(type === 'receipt' ? 'error.qty_positive' : 'error.qty_invalid'));
      return;
    }
    record.mutate(
      {
        warehouseId,
        variantId: item.variantId,
        type,
        qty: baseQty,
        ...(type === 'receipt' && lotNo.trim() !== '' ? { lotNo: lotNo.trim() } : {}),
        ...(type === 'receipt' && expiry !== '' ? { expiryDate: expiry } : {}),
        ...(note.trim() !== '' ? { note: note.trim() } : {}),
      },
      {
        onSuccess: (result) => {
          onDone(
            result.movement === null
              ? t('done.unchanged', { product })
              : t(`done.${type}`, { product, qty: qtyText(result.stock.onHand, item).primary }),
          );
        },
        onError: (error) => {
          const code = error instanceof ApiError ? error.code : 'INTERNAL_ERROR';
          if (code === 'VALIDATION_FAILED') setQtyError(t('error.qty_invalid'));
          else if (code === 'STOCK_INSUFFICIENT') setQtyError(tErrors(code));
          else setGeneral(tErrors(code));
        },
      },
    );
  }

  return (
    <Dialog labelledBy={`${id}-title`} describedBy={`${id}-desc`} onClose={onClose}>
      <form
        noValidate
        onSubmit={onSubmit}
        className="space-y-5"
        data-testid={`stock-dialog-${type}`}
      >
        <div className="space-y-1">
          <h2 id={`${id}-title`} className="text-lg font-semibold text-slate-900">
            {title}
          </h2>
          <p id={`${id}-desc`} className="text-sm text-slate-500">
            {product} · {item.sku}
          </p>
        </div>
        {type === 'adjustment' && (
          <p className="rounded-xl border border-slate-200/80 bg-slate-50/60 px-4 py-3 text-sm text-slate-600">
            {item.counted
              ? t('dialog.adjustment.current', { qty: qtyText(current, item).primary })
              : t('dialog.adjustment.first')}
          </p>
        )}
        <div className="grid grid-cols-[1fr_auto] items-start gap-3">
          <Field
            id={`${id}-qty`}
            label={t(`dialog.${type}.qty`)}
            hint={t(`dialog.${type}.qty_hint`)}
            error={qtyError}
          >
            <TextInput
              id={`${id}-qty`}
              data-autofocus
              inputMode="decimal"
              value={qty}
              invalid={qtyError !== undefined}
              aria-describedby={qtyError === undefined ? undefined : `${id}-qty-error`}
              onChange={(event) => {
                setQty(event.target.value);
                setQtyError(undefined);
              }}
            />
          </Field>
          <Field id={`${id}-unit`} label={t('dialog.unit')}>
            <SelectInput
              id={`${id}-unit`}
              value={unit}
              onChange={(event) => {
                setUnit(event.target.value);
              }}
            >
              {packs.map((p) => (
                <option key={p.level} value={p.level}>
                  {t('dialog.unit_option', {
                    unit: abbr(p.unitCode),
                    qty: trimQty(p.baseQty),
                    base: abbr(item.baseUnitCode),
                  })}
                </option>
              ))}
              <option value={BASE}>{abbr(item.baseUnitCode)}</option>
            </SelectInput>
          </Field>
        </div>
        {baseQty !== null && unit !== BASE && (
          <p className="text-xs text-slate-500" data-testid="stock-dialog-base">
            {t('dialog.equals', { qty: qtyText(baseQty, item).base ?? '' })}
          </p>
        )}
        {delta !== null && (
          <p className="text-sm text-slate-700" data-testid="stock-dialog-delta">
            {trimQty(delta) === '0'
              ? t('dialog.adjustment.same')
              : t('dialog.adjustment.delta', {
                  delta: signed(delta, item),
                })}
          </p>
        )}
        {type === 'receipt' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id={`${id}-lot`} label={t('dialog.lot')}>
              <TextInput
                id={`${id}-lot`}
                value={lotNo}
                maxLength={STOCK_LOT_NO_MAX}
                onChange={(event) => {
                  setLotNo(event.target.value);
                }}
              />
            </Field>
            <Field id={`${id}-expiry`} label={t('dialog.expiry')}>
              <TextInput
                id={`${id}-expiry`}
                type="date"
                value={expiry}
                onChange={(event) => {
                  setExpiry(event.target.value);
                }}
              />
            </Field>
          </div>
        )}
        <Field id={`${id}-note`} label={t('dialog.note')}>
          <TextArea
            id={`${id}-note`}
            rows={2}
            value={note}
            maxLength={STOCK_NOTE_MAX}
            onChange={(event) => {
              setNote(event.target.value);
            }}
          />
        </Field>
        {general !== undefined && (
          <p
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
          >
            {general}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t('dialog.cancel')}
          </Button>
          <Button type="submit" disabled={record.isPending} data-testid="stock-dialog-submit">
            {t(`dialog.${type}.submit`)}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
