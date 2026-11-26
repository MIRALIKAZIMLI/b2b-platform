'use client';
// Varyantlar ve ambalaj seviyeleri (F3.3b-AC3, AC8; US-030 AC2, F3.3a K3/K4). UX kararları:
// - Her varyant ayrı kart: SKU, GTIN, özellikler (ad → değer satırları), ambalaj seviyeleri.
// - Ambalaj: adet satırı sabit (birim = temel birim, miktar 1; K4); eksik her seviye (iç paket,
//   koli, palet) için "+ əlavə et" düğmesi; eklenen satır sıraya yerleşir. Satırda birim, içindeki adet, GTIN, satış birimi,
//   en az miktar, kat. Dar ekranda satırlar kart gibi alt alta.
// - Varyant kaldırılınca kayıtlıysa "arşivdekiler"e geçer (kaydedince sunucu arşivler, K3);
//   arşivdeki varyant "Bərpa et" ile geri alınır (kimliğiyle yeniden etkinleşir).
import {
  type AttributeRow,
  emptyVariant,
  missingPackagingLevels,
  type PackagingForm,
  type PackagingLevel,
  PRODUCT_SKU_MAX,
  PRODUCT_VARIANTS_MAX,
  pickLocalizedText,
  sortPackaging,
  unitPackaging,
  VARIANT_ATTRIBUTES_MAX,
  type VariantForm,
  variantHasError,
  type ProductFieldErrors,
} from '@b2b/shared';
import { useLocale, useTranslations } from 'next-intl';
import { Badge, Button, Card, Field, SelectInput, TextInput } from '../ui/primitives';
import type { Unit } from './api';
import { useFieldError } from './error-text';

export function unitLabel(unit: Unit, locale: string): string {
  const abbr = pickLocalizedText(unit.abbreviation, locale) ?? unit.code;
  const name = pickLocalizedText(unit.name, locale) ?? unit.code;
  return abbr === name ? name : `${name} (${abbr})`;
}

export function VariantsEditor({
  variants,
  archived,
  baseUnitCode,
  units,
  errors,
  newKey,
  readOnly,
  onChange,
}: {
  variants: readonly VariantForm[];
  archived: readonly VariantForm[];
  baseUnitCode: string;
  units: readonly Unit[];
  errors: ProductFieldErrors;
  newKey: () => string;
  /** Salt okunur (arşiv, izin yok): ekleme/çıkarma düğmeleri gizlenir. */
  readOnly: boolean;
  onChange: (variants: VariantForm[], archived: VariantForm[]) => void;
}) {
  const t = useTranslations('products');
  const fieldError = useFieldError(errors);

  const setVariant = (index: number, next: VariantForm) => {
    onChange(
      variants.map((variant, i) => (i === index ? next : variant)),
      [...archived],
    );
  };
  const remove = (index: number) => {
    const target = variants[index];
    if (target === undefined) return;
    onChange(
      variants.filter((_, i) => i !== index),
      target.id === undefined ? [...archived] : [...archived, target],
    );
  };
  const restore = (key: string) => {
    const target = archived.find((variant) => variant.key === key);
    if (target === undefined) return;
    onChange(
      [...variants, target],
      archived.filter((variant) => variant.key !== key),
    );
  };

  return (
    <section aria-labelledby="variants-title" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h2 id="variants-title" className="text-base font-semibold text-slate-900">
            {t('section.variants')}
          </h2>
          <p className="text-sm text-slate-500">{t('section.variants_hint')}</p>
        </div>
        {!readOnly && (
          <Button
            variant="secondary"
            disabled={variants.length + archived.length >= PRODUCT_VARIANTS_MAX}
            onClick={() => {
              onChange([...variants, emptyVariant(newKey(), baseUnitCode)], [...archived]);
            }}
          >
            {t('variant.add')}
          </Button>
        )}
      </div>
      {fieldError('variants') !== undefined && (
        <p role="alert" className="text-sm font-medium text-rose-600">
          {fieldError('variants')}
        </p>
      )}
      {variants.map((variant, index) => (
        <VariantCard
          key={variant.key}
          index={index}
          variant={variant}
          units={units}
          baseUnitCode={baseUnitCode}
          errors={errors}
          invalid={variantHasError(errors, index)}
          readOnly={readOnly}
          canRemove={!readOnly && variants.length > 1}
          onChange={(next) => {
            setVariant(index, next);
          }}
          onRemove={() => {
            remove(index);
          }}
        />
      ))}
      {archived.length > 0 && (
        <details className="group rounded-2xl border border-slate-200/80 bg-white/60 px-6 py-4">
          <summary className="cursor-pointer text-sm font-medium text-slate-700 select-none">
            {t('variant.archived', { count: archived.length })}
          </summary>
          <ul className="mt-3 divide-y divide-slate-100">
            {archived.map((variant) => (
              <li
                key={variant.key}
                data-testid="archived-variant"
                className="flex items-center justify-between gap-3 py-2"
              >
                <span className="font-mono text-sm text-slate-600">{variant.sku}</span>
                {!readOnly && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      restore(variant.key);
                    }}
                  >
                    {t('variant.restore')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">{t('variant.archived_hint')}</p>
        </details>
      )}
    </section>
  );
}

function VariantCard({
  index,
  variant,
  units,
  baseUnitCode,
  errors,
  invalid,
  readOnly,
  canRemove,
  onChange,
  onRemove,
}: {
  index: number;
  variant: VariantForm;
  units: readonly Unit[];
  baseUnitCode: string;
  errors: ProductFieldErrors;
  invalid: boolean;
  readOnly: boolean;
  canRemove: boolean;
  onChange: (next: VariantForm) => void;
  onRemove: () => void;
}) {
  const t = useTranslations('products');
  const fieldError = useFieldError(errors);
  const at = `variants.${String(index)}`;
  const id = (field: string) => `variant-${variant.key}-${field}`;
  const missing = missingPackagingLevels(variant.packaging);

  const setAttributes = (rows: AttributeRow[]) => {
    onChange({ ...variant, attributes: rows });
  };
  const setPackaging = (rows: PackagingForm[]) => {
    onChange({ ...variant, packaging: sortPackaging(rows) });
  };

  return (
    <Card
      className={`space-y-6 p-6 sm:p-8 ${invalid ? 'border-rose-200 hover:border-rose-300' : ''}`}
    >
      <div data-testid="variant-card" className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-600/10">
            {index + 1}
          </span>
          <h3 className="text-sm font-semibold text-slate-900">
            {variant.sku.trim() === '' ? t('variant.title_new') : variant.sku}
          </h3>
          {variant.id === undefined && <Badge tone="slate">{t('variant.new')}</Badge>}
        </div>
        {canRemove && (
          <Button variant="quiet-danger" onClick={onRemove}>
            {t('variant.remove')}
          </Button>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={id('sku')} label={t('field.variant_sku')} error={fieldError(`${at}.sku`)}>
          <TextInput
            id={id('sku')}
            name={`${at}.sku`}
            autoComplete="off"
            maxLength={PRODUCT_SKU_MAX}
            value={variant.sku}
            invalid={fieldError(`${at}.sku`) !== undefined}
            aria-invalid={fieldError(`${at}.sku`) !== undefined}
            onChange={(event) => {
              onChange({ ...variant, sku: event.target.value });
            }}
          />
        </Field>
        <Field
          id={id('gtin')}
          label={t('field.gtin')}
          hint={t('field.gtin_hint')}
          error={fieldError(`${at}.gtin`)}
        >
          <TextInput
            id={id('gtin')}
            name={`${at}.gtin`}
            inputMode="numeric"
            autoComplete="off"
            maxLength={14}
            value={variant.gtin}
            invalid={fieldError(`${at}.gtin`) !== undefined}
            onChange={(event) => {
              onChange({ ...variant, gtin: event.target.value });
            }}
          />
        </Field>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-slate-900">{t('attribute.title')}</p>
          {!readOnly && (
            <Button
              variant="secondary"
              disabled={variant.attributes.length >= VARIANT_ATTRIBUTES_MAX}
              onClick={() => {
                setAttributes([...variant.attributes, { key: '', value: '', kind: 'string' }]);
              }}
            >
              {t('attribute.add')}
            </Button>
          )}
        </div>
        {variant.attributes.length === 0 && !readOnly && (
          <p className="text-xs text-slate-500">{t('attribute.empty')}</p>
        )}
        {variant.attributes.map((row, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
            <TextInput
              aria-label={t('attribute.key')}
              placeholder={t('attribute.key_placeholder')}
              maxLength={40}
              value={row.key}
              onChange={(event) => {
                setAttributes(
                  variant.attributes.map((item, j) =>
                    j === i ? { ...item, key: event.target.value } : item,
                  ),
                );
              }}
            />
            <TextInput
              aria-label={t('attribute.value')}
              placeholder={t('attribute.value_placeholder')}
              maxLength={100}
              value={row.value}
              onChange={(event) => {
                setAttributes(
                  variant.attributes.map((item, j) =>
                    j === i ? { ...item, value: event.target.value } : item,
                  ),
                );
              }}
            />
            <Button
              variant="quiet-danger"
              aria-label={t('attribute.remove')}
              onClick={() => {
                setAttributes(variant.attributes.filter((_, j) => j !== i));
              }}
            >
              ×
            </Button>
          </div>
        ))}
        {fieldError(`${at}.attributes`) !== undefined && (
          <p role="alert" className="text-xs font-medium text-rose-600">
            {fieldError(`${at}.attributes`)}
          </p>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-900">{t('packaging.title')}</p>
            <p className="text-xs text-slate-500">{t('packaging.hint')}</p>
          </div>
          {missing.length > 0 && !readOnly && (
            <div className="flex flex-wrap gap-2">
              {missing.map((level) => (
                <Button
                  key={level}
                  variant="secondary"
                  onClick={() => {
                    setPackaging([...variant.packaging, newLevel(level, baseUnitCode)]);
                  }}
                >
                  {t('packaging.add', { level: t(`level.${level}`) })}
                </Button>
              ))}
            </div>
          )}
        </div>
        <ul className="space-y-2">
          {variant.packaging.map((item, j) => (
            <PackagingRow
              key={item.level}
              item={item}
              path={`${at}.packaging.${String(j)}`}
              idPrefix={id(`pack-${item.level}`)}
              readOnly={readOnly}
              units={units}
              errors={errors}
              onChange={(next) => {
                setPackaging(variant.packaging.map((row, k) => (k === j ? next : row)));
              }}
              onRemove={() => {
                setPackaging(variant.packaging.filter((_, k) => k !== j));
              }}
            />
          ))}
        </ul>
        {fieldError(`${at}.packaging`) !== undefined && (
          <p role="alert" className="text-xs font-medium text-rose-600">
            {fieldError(`${at}.packaging`)}
          </p>
        )}
      </div>
    </Card>
  );
}

/** Yeni seviyenin önerilen birimi (UN/ECE: paket, karton, palet); kullanıcı değiştirir. */
const LEVEL_UNIT: Record<PackagingLevel, string | undefined> = {
  unit: undefined,
  inner: 'XPK',
  case: 'XCT',
  pallet: 'XPX',
};

function newLevel(level: PackagingLevel, baseUnitCode: string): PackagingForm {
  return {
    ...unitPackaging(baseUnitCode),
    level,
    unitCode: LEVEL_UNIT[level] ?? baseUnitCode,
    baseQty: '',
    isSalesUnit: false,
  };
}

function PackagingRow({
  item,
  path,
  idPrefix,
  readOnly,
  units,
  errors,
  onChange,
  onRemove,
}: {
  item: PackagingForm;
  path: string;
  idPrefix: string;
  readOnly: boolean;
  units: readonly Unit[];
  errors: ProductFieldErrors;
  onChange: (next: PackagingForm) => void;
  onRemove: () => void;
}) {
  const t = useTranslations('products');
  const locale = useLocale();
  const fieldError = useFieldError(errors);
  const fixed = item.level === 'unit';
  const unitOptions = units.map((unit) => ({ code: unit.code, label: unitLabel(unit, locale) }));
  // Kayıtlı ama artık pasif birim seçili kalır (R38).
  if (!units.some((unit) => unit.code === item.unitCode)) {
    unitOptions.push({ code: item.unitCode, label: item.unitCode });
  }
  const qtyInput = (field: 'baseQty' | 'minOrderQty' | 'orderMultiple', disabled = false) => {
    const error = fieldError(`${path}.${field}`);
    return (
      <Field
        id={`${idPrefix}-${field}`}
        label={t(`packaging.${field}`)}
        error={error}
        className={field === 'baseQty' ? 'lg:col-span-3' : 'lg:col-span-4'}
      >
        <TextInput
          id={`${idPrefix}-${field}`}
          name={`${path}.${field}`}
          inputMode="decimal"
          autoComplete="off"
          maxLength={15}
          disabled={disabled}
          value={item[field]}
          invalid={error !== undefined}
          aria-invalid={error !== undefined}
          onChange={(event) => {
            onChange({ ...item, [field]: event.target.value.replace(',', '.') });
          }}
        />
      </Field>
    );
  };
  return (
    <li
      data-testid="packaging-row"
      data-level={item.level}
      className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 transition-colors duration-200 hover:border-slate-300"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-900">{t(`level.${item.level}`)}</span>
          {item.isSalesUnit && <Badge tone="emerald">{t('packaging.sales_unit_badge')}</Badge>}
        </div>
        {!fixed && !readOnly && (
          <Button variant="quiet-danger" onClick={onRemove}>
            {t('packaging.remove')}
          </Button>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12">
        <Field
          id={`${idPrefix}-unit`}
          label={t('packaging.unit')}
          error={fieldError(`${path}.unitCode`)}
          className="lg:col-span-4"
        >
          <SelectInput
            id={`${idPrefix}-unit`}
            name={`${path}.unitCode`}
            disabled={fixed}
            value={item.unitCode}
            invalid={fieldError(`${path}.unitCode`) !== undefined}
            onChange={(event) => {
              onChange({ ...item, unitCode: event.target.value });
            }}
          >
            {unitOptions.map((unit) => (
              <option key={unit.code} value={unit.code}>
                {unit.label}
              </option>
            ))}
          </SelectInput>
        </Field>
        {qtyInput('baseQty', fixed)}
        <Field
          id={`${idPrefix}-gtin`}
          label={t('field.gtin')}
          error={fieldError(`${path}.gtin`)}
          className="lg:col-span-5"
        >
          <TextInput
            id={`${idPrefix}-gtin`}
            name={`${path}.gtin`}
            inputMode="numeric"
            autoComplete="off"
            maxLength={14}
            value={item.gtin}
            invalid={fieldError(`${path}.gtin`) !== undefined}
            onChange={(event) => {
              onChange({ ...item, gtin: event.target.value });
            }}
          />
        </Field>
        <label className="flex items-center gap-2 self-end pb-2.5 text-sm font-medium text-slate-700 lg:col-span-4">
          <input
            type="checkbox"
            name={`${path}.isSalesUnit`}
            checked={item.isSalesUnit}
            onChange={(event) => {
              onChange({ ...item, isSalesUnit: event.target.checked });
            }}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/40"
          />
          {t('packaging.isSalesUnit')}
        </label>
        {item.isSalesUnit && qtyInput('minOrderQty')}
        {item.isSalesUnit && qtyInput('orderMultiple')}
      </div>
    </li>
  );
}
