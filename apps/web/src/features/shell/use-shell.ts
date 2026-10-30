'use client';
// Kabuk durumu (F1.13b): oturum + `/me` + seçili işletme. İşletme seçili değilse varsayılan üyelik
// seçilir (US-003 AC1; "son kullanılan" saklanmaz, bkz. PR notu); `/me` seçili işletmeyle hata
// verirse (ör. üyelik kaldırıldı) seçim bırakılır ve o işletme bu sayfa ömründe atlanır.
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import {
  SESSION_KEY,
  setActiveBusinessId,
  useActiveBusinessId,
  useMe,
  useSession,
} from '../../lib/session';
import { defaultBusinessId } from './landing';

const rejected = new Set<string>();

const selectable = (businessId: string | undefined): boolean =>
  businessId !== undefined && !rejected.has(businessId);

export function useShell() {
  const session = useSession();
  const hasSession = session.data === true;
  const active = useActiveBusinessId();
  const me = useMe(hasSession);
  const memberships = me.data?.memberships ?? [];

  useEffect(() => {
    if (me.isError && active !== undefined) {
      rejected.add(active);
      setActiveBusinessId(undefined);
      return;
    }
    if (me.data === undefined || active !== undefined) return;
    const candidates = (me.data.memberships ?? []).filter((m) => selectable(m.businessId));
    const next = defaultBusinessId(candidates);
    if (next !== undefined) setActiveBusinessId(next);
  }, [me.data, me.isError, active]);

  // Hazır: `/me` geldi ve (seçim varsa) o işletmenin izinlerini taşıyor; seçilecek işletme kalmadı.
  const pendingDefault = active === undefined && memberships.some((m) => selectable(m.businessId));
  const ready =
    me.data !== undefined &&
    !pendingDefault &&
    (active === undefined || me.data.activeBusiness?.id === active);

  return {
    sessionLoading: session.isPending,
    hasSession,
    me: ready ? me.data : undefined,
    activeBusinessId: active,
  };
}

/** İşletme değiştir: seçim güncellenir, oturum dışındaki tüm sorgu önbelleği temizlenir (AC2). */
export function useSelectBusiness(): (businessId: string) => void {
  const queryClient = useQueryClient();
  return (businessId) => {
    setActiveBusinessId(businessId);
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== SESSION_KEY[0] });
  };
}
