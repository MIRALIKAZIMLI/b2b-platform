'use client';
// VÖEN rozeti (F2.18b): doğrulanmış (yeşil), kontrol bekliyor (amber), girilmemiş (gri).
import { useTranslations } from 'next-intl';
import { Badge } from '../ui/primitives';
import type { AdminBuyer } from './api';
import { voenState } from './model';

export function VoenBadge({ buyer }: { buyer: AdminBuyer }) {
  const t = useTranslations('adminBuyers');
  const state = voenState(buyer);
  if (state === 'missing') return <Badge tone="slate">{t('voen_state.missing')}</Badge>;
  return (
    <Badge tone={state === 'verified' ? 'emerald' : 'amber'}>{t(`voen_state.${state}`)}</Badge>
  );
}
