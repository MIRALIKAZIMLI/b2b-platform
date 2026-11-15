'use client';
// Sistem ayarları (F2.19, US-017). UX kararları:
// - Üstte üç parçalı kapsam seçici (Platforma · Plan · Müəssisə); plan/işletme seçilince yanında
//   açılır liste. Plan/işletme kapsamında yalnız o kapsamda yazılabilen anahtarlar görünür (T2),
//   üstte kısa açıklama.
// - Ayarlar konu başlıklı kartlarda; her satır okunur ad + küçük anahtar, sağda geçerli değer ve
//   kaynağı (bu kapsam / plandan / platformdan / varsayılan) rozeti, "Dəyişdir".
// - Düzenleme satırın içinde açılır; tür ve sınır ipucu altında, sınır dışı değer yazarken
//   anında uyarı (US-017 AC3), kaydedince satırda yeşil "Yadda saxlandı".
// - Arama kutusu ad ve anahtarda süzer.
import type { SettingScope } from '@b2b/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { errorCodeOf } from '../../lib/error-code';
import { useBuyers } from '../admin-buyers/api';
import { useSellers } from '../admin-sellers/api';
import { Button, Card, Field, PageHeader, SelectInput, TextInput } from '../ui/primitives';
import { type SettingsTarget, useAdminSettings, useAllPlanOptions } from './api';
import { groupItems, visibleItems } from './model';
import { SettingRow } from './setting-row';

const SCOPES: readonly SettingScope[] = ['platform', 'plan', 'business'];

export function SettingsPage() {
  const t = useTranslations('adminSettings');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  const [scope, setScope] = useState<SettingScope>('platform');
  const [planId, setPlanId] = useState('');
  const [businessId, setBusinessId] = useState('');
  const [query, setQuery] = useState('');

  const scopeId = scope === 'plan' ? planId : scope === 'business' ? businessId : '';
  const target: SettingsTarget = scope === 'platform' ? { scope } : { scope, scopeId };
  const ready = scope === 'platform' || scopeId !== '';
  const settings = useAdminSettings(target, ready);

  const labelOf = (key: string) => t(`key.${key}`);
  const groups = useMemo(
    () =>
      groupItems(visibleItems(settings.data?.items ?? [], scope, query, (key) => t(`key.${key}`))),
    [settings.data, scope, query, t],
  );

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6 lg:py-12">
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} description={t('description')} />

      <Card className="space-y-5 p-5 sm:p-6">
        <div
          role="radiogroup"
          aria-label={t('scope_label')}
          className="inline-flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-slate-200/80 bg-slate-50/70 p-1"
        >
          {SCOPES.map((item) => {
            const selected = item === scope;
            return (
              <button
                key={item}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  setScope(item);
                }}
                className={`shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none ${
                  selected
                    ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/20'
                    : 'text-slate-600 hover:bg-white hover:text-slate-900'
                }`}
              >
                {t(`scope.${item}`)}
              </button>
            );
          })}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {scope === 'plan' && <PlanPicker value={planId} onChange={setPlanId} />}
          {scope === 'business' && <BusinessPicker value={businessId} onChange={setBusinessId} />}
          <Field id="settings-search" label={t('search_label')}>
            <TextInput
              id="settings-search"
              type="search"
              value={query}
              placeholder={t('search_placeholder')}
              onChange={(event) => {
                setQuery(event.target.value);
              }}
            />
          </Field>
        </div>
        {scope !== 'platform' && (
          <p className="rounded-xl bg-indigo-50/70 px-4 py-3 text-sm text-indigo-900 ring-1 ring-indigo-500/10">
            {t('scoped_note')}
          </p>
        )}
      </Card>

      {!ready ? (
        <p className="text-sm text-slate-500">{t('pick_target')}</p>
      ) : settings.isPending ? (
        <p role="status" className="text-sm text-slate-500">
          {tCommon('loading')}
        </p>
      ) : settings.isError ? (
        <p role="alert" className="text-sm font-medium text-rose-600">
          {tErrors(errorCodeOf(settings.error))}
        </p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-slate-500">{t('empty_search')}</p>
      ) : (
        <div className="space-y-6">
          {groups.map(([group, items]) => (
            <section key={group} aria-labelledby={`group-${group}`} className="space-y-3">
              <h2
                id={`group-${group}`}
                className="text-xs font-semibold tracking-wider text-slate-500 uppercase"
              >
                {t(`group.${group}`)}
              </h2>
              <Card className="divide-y divide-slate-100 overflow-hidden hover:shadow-sm">
                {items.map((item) => (
                  <SettingRow
                    key={`${scope}:${scopeId}:${item.key}`}
                    item={item}
                    target={target}
                    label={labelOf(item.key)}
                  />
                ))}
              </Card>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function PlanPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const t = useTranslations('adminSettings');
  const locale = useLocale();
  const plans = useAllPlanOptions(locale);
  return (
    <Field id="settings-plan" label={t('plan_label')}>
      <SelectInput
        id="settings-plan"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      >
        <option value="">{t('plan_placeholder')}</option>
        {(plans.data ?? []).map((plan) => (
          <option key={plan.id} value={plan.id}>
            {plan.label}
          </option>
        ))}
      </SelectInput>
    </Field>
  );
}

/** İşletme seçimi mevcut admin listelerinden (T5): toptancılar ve perakendeciler, sayfa sayfa. */
function BusinessPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const t = useTranslations('adminSettings');
  const sellers = useSellers();
  const buyers = useBuyers('all');
  const sellerItems = sellers.data?.pages.flatMap((page) => page.items) ?? [];
  const buyerItems = buyers.data?.pages.flatMap((page) => page.items) ?? [];
  const more = sellers.hasNextPage || buyers.hasNextPage;
  return (
    <Field id="settings-business" label={t('business_label')}>
      <div className="flex gap-2">
        <SelectInput
          id="settings-business"
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        >
          <option value="">{t('business_placeholder')}</option>
          <optgroup label={t('business_group.sellers')}>
            {sellerItems.map((seller) => (
              <option key={seller.id} value={seller.id}>
                {seller.legalName}
              </option>
            ))}
          </optgroup>
          <optgroup label={t('business_group.buyers')}>
            {buyerItems.map((buyer) => (
              <option key={buyer.id} value={buyer.id}>
                {buyer.legalName}
              </option>
            ))}
          </optgroup>
        </SelectInput>
        {more && (
          <Button
            variant="secondary"
            className="shrink-0"
            onClick={() => {
              if (sellers.hasNextPage) void sellers.fetchNextPage();
              if (buyers.hasNextPage) void buyers.fetchNextPage();
            }}
          >
            {t('load_more')}
          </Button>
        )}
      </div>
    </Field>
  );
}
