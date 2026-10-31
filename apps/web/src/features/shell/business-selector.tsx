'use client';
import type { components } from '@b2b/api-client';
import { useTranslations } from 'next-intl';
import { useSelectBusiness } from './use-shell';

type Membership = components['schemas']['MembershipSummary'];

function label(item: Membership): string {
  const name = item.businessName ?? '';
  const role = item.roleName ?? '';
  return role === '' ? name : `${name} · ${role}`;
}

/** Üst menüde işletme seçici (US-003 AC1–AC2). Yalnızca kullanıcının üyelikleri (`/me`). */
export function BusinessSelector({
  memberships,
  activeBusinessId,
}: {
  memberships: readonly Membership[];
  activeBusinessId: string | undefined;
}) {
  const t = useTranslations('shell');
  const select = useSelectBusiness();
  if (memberships.length === 0) return null;
  return (
    <label className="flex items-center gap-3 text-sm font-medium text-slate-500">
      {t('business_label')}
      <select
        name="business"
        className="rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm transition-all duration-200 hover:border-slate-300 focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none"
        value={activeBusinessId ?? ''}
        onChange={(event) => {
          select(event.target.value);
        }}
      >
        {memberships.map((item) => (
          <option key={item.businessId} value={item.businessId}>
            {label(item)}
          </option>
        ))}
      </select>
    </label>
  );
}
