'use client';
// Rolün gerektirdiği kapsam alanları (F2.7 K9): şube veya depo seçimi, `assigned` rolde bölgeler.
// Şube ve depo listesi `business.manage` ister (F2.5b T8); okunamazsa açıklama gösterilir ve kaydet
// pasif kalır. Admin olmayan yönetici yalnız kendi şubesine bağlayabilir (S1); sunucu 403 verir.
import { filterRegionOptions, type ScopeNeeds, type TeamFieldError } from '@b2b/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import type { Option } from '../admin-sellers/api';
import { Field, SelectInput, TextInput } from '../ui/primitives';

export interface ScopeOptions {
  /** `undefined`: liste okunamadı / bu adımda yok. */
  readonly warehouses: readonly Option[] | undefined;
  readonly branches: readonly Option[] | undefined;
  /** Seçilebilir şubeler (S1: admin olmayan yalnız kendi şubesi); `branches` adlar için kalır. */
  readonly branchChoices: readonly Option[] | undefined;
  /** Seçim aktörün kendi şubesiyle sınırlı mı (açıklama gösterilir). */
  readonly branchOwnOnly: boolean;
  readonly regions: readonly Option[];
}

/** Gereken kapsam seçilebiliyor mu (liste yoksa form gönderilemez). */
export function scopeAvailable(needs: ScopeNeeds, options: ScopeOptions): boolean {
  return (
    (!needs.branch || (options.branchChoices !== undefined && options.branchChoices.length > 0)) &&
    (!needs.warehouse || options.warehouses !== undefined)
  );
}

export function ScopeFields({
  idPrefix,
  needs,
  options,
  values,
  errors,
  withRegions,
  onChange,
}: {
  idPrefix: string;
  needs: ScopeNeeds;
  options: ScopeOptions;
  values: { branchId: string; warehouseId: string; regionIds?: readonly string[] };
  errors: Partial<Record<'branchId' | 'warehouseId' | 'regionIds', TeamFieldError>>;
  withRegions: boolean;
  onChange: (next: { branchId?: string; warehouseId?: string; regionIds?: string[] }) => void;
}) {
  const t = useTranslations('team');
  const locale = useLocale();
  const [query, setQuery] = useState('');
  const error = (field: 'branchId' | 'warehouseId' | 'regionIds') => {
    const reason = errors[field];
    return reason === undefined ? undefined : t(`error.${reason}`);
  };

  const select = (
    field: 'branchId' | 'warehouseId',
    list: readonly Option[] | undefined,
    unavailable: string,
    restricted?: string,
  ) => (
    <Field
      id={`${idPrefix}-${field}`}
      label={t(`field.${field}`)}
      error={error(field)}
      hint={list === undefined ? unavailable : restricted}
    >
      <SelectInput
        id={`${idPrefix}-${field}`}
        name={field}
        value={values[field]}
        disabled={list === undefined}
        invalid={errors[field] !== undefined}
        aria-invalid={errors[field] !== undefined}
        onChange={(event) => {
          onChange({ [field]: event.target.value });
        }}
      >
        <option value="">{t('choose')}</option>
        {(list ?? []).map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </SelectInput>
    </Field>
  );

  const selected = new Set(values.regionIds ?? []);
  const shown = filterRegionOptions(options.regions, query, locale);

  return (
    <>
      {needs.branch &&
        select(
          'branchId',
          options.branchChoices,
          t('branch_unavailable'),
          options.branchOwnOnly ? t('branch_own_only') : undefined,
        )}
      {needs.warehouse && select('warehouseId', options.warehouses, t('warehouse_unavailable'))}
      {withRegions && needs.regions && (
        <fieldset className="space-y-2 sm:col-span-2">
          <legend className="text-sm font-medium text-slate-900">
            {t('field.regionIds')}{' '}
            <span className="font-normal text-slate-500 tabular-nums">
              {t('regions_selected', { count: selected.size })}
            </span>
          </legend>
          <TextInput
            aria-label={t('region_search')}
            placeholder={t('region_search')}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
          />
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-slate-200/80 bg-white p-2">
            {shown.map((region) => {
              const checked = selected.has(region.id);
              return (
                <label
                  key={region.id}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-sm text-slate-700 transition-colors duration-200 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    className="size-4 rounded border-slate-300 text-indigo-600 focus-visible:ring-2 focus-visible:ring-indigo-500/40"
                    checked={checked}
                    onChange={() => {
                      const next = new Set(selected);
                      if (checked) next.delete(region.id);
                      else next.add(region.id);
                      onChange({ regionIds: [...next] });
                    }}
                  />
                  {region.label}
                </label>
              );
            })}
          </div>
          {error('regionIds') !== undefined && (
            <p role="alert" className="text-xs font-medium text-rose-600">
              {error('regionIds')}
            </p>
          )}
        </fieldset>
      )}
    </>
  );
}
