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
    <label>
      {t('business_label')}
      <select
        name="business"
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
