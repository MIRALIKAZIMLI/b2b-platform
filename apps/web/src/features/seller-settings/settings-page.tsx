'use client';
// Toptancı ayarları (F2.6, US-011). UX kararları: tek sayfa, üç sekme (satıcı profili, depolar,
// hizmet bölgeleri); her sekme kendi "Kaydet"iyle bağımsız (yarım kalan form diğerini etkilemez).
// Para birimi (minimum tutarın yanında) işletme profilinden.
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useBusinessProfile } from '../buyer-registration/api';
import { useShell } from '../shell/use-shell';
import { PageHeader } from '../ui/primitives';
import { SellerProfileCard } from './profile-card';
import { ServiceAreasCard } from './service-areas-card';
import { WarehousesCard } from './warehouses-card';

const TABS = ['profile', 'warehouses', 'areas'] as const;
type Tab = (typeof TABS)[number];

export function SellerSettingsPage() {
  const t = useTranslations('sellerSettings');
  const { activeBusinessId } = useShell();
  const business = useBusinessProfile(activeBusinessId, true);
  const [tab, setTab] = useState<Tab>('profile');

  return (
    <div className="space-y-8 px-4 py-8 sm:px-6 lg:py-10">
      <PageHeader title={t('title')} description={t('description')} />
      <div
        role="tablist"
        aria-label={t('title')}
        className="inline-flex flex-wrap gap-1 rounded-2xl border border-slate-200/80 bg-white/70 p-1 shadow-sm backdrop-blur"
      >
        {TABS.map((key) => {
          const active = key === tab;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              id={`seller-settings-tab-${key}`}
              aria-selected={active}
              aria-controls="seller-settings-panel"
              onClick={() => {
                setTab(key);
              }}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none ${
                active
                  ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/20'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {t(`tab.${key}`)}
            </button>
          );
        })}
      </div>
      <section
        id="seller-settings-panel"
        role="tabpanel"
        aria-labelledby={`seller-settings-tab-${tab}`}
        className="max-w-4xl"
      >
        {tab === 'profile' && (
          <SellerProfileCard businessId={activeBusinessId} currency={business.data?.currency} />
        )}
        {tab === 'warehouses' && <WarehousesCard businessId={activeBusinessId} />}
        {tab === 'areas' && <ServiceAreasCard businessId={activeBusinessId} />}
      </section>
    </div>
  );
}
