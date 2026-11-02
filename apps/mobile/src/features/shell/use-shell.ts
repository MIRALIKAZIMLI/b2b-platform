// Kabuk durumu (F1.14b; web `use-shell.ts` ile aynı mantık): oturum + `/me` + seçili işletme.
// Seçili işletme yalnızca bellekte (`lib/session.ts`); seçili değilse son kullanılan
// (`/me.lastBusinessId`, F2.7b S8), o yoksa varsayılan üyelik seçilir; elle seçim `PATCH /me` ile
// hatırlanır.
// `/me` seçili işletmeyle hata verirse (ör. üyelik kaldırıldı) seçim bırakılır ve o işletme bu
// uygulama ömründe atlanır. Profildeki dil açılışta da uygulanır (Müfettiş #33 L2).
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import {
  SESSION_KEY,
  activeBusinessId,
  setActiveBusinessId,
  subscribeActiveBusiness,
  useMe,
  useRememberBusiness,
  useSession,
} from '../../lib/session';
import { APP_CONFIG_KEY } from '../../lib/app-config';
import { I18N_INIT_KEY, useLanguageController } from '../language/language-provider';
import { defaultBusinessId } from './shell-state';

const rejected = new Set<string>();
/** İşletmeden bağımsız sorgular: oturum, çeviriler, sürüm kontrolü. */
const KEPT_QUERIES: ReadonlySet<string> = new Set([
  SESSION_KEY[0],
  I18N_INIT_KEY[0],
  APP_CONFIG_KEY[0],
]);
let profileLanguageAppliedFor: string | undefined;

const selectable = (businessId: string | undefined): boolean =>
  businessId !== undefined && !rejected.has(businessId);

export function useActiveBusinessId(): string | undefined {
  return useSyncExternalStore(subscribeActiveBusiness, activeBusinessId, activeBusinessId);
}

export function useShell() {
  const session = useSession();
  const hasSession = session.data === true;
  const active = useActiveBusinessId();
  const me = useMe(hasSession, active);
  const memberships = me.data?.memberships ?? [];
  const language = useLanguageController();
  const { i18n } = useTranslation();

  useEffect(() => {
    if (me.isError && active !== undefined) {
      rejected.add(active);
      setActiveBusinessId(undefined);
      return;
    }
    if (me.data === undefined || active !== undefined) return;
    const candidates = (me.data.memberships ?? []).filter((m) => selectable(m.businessId));
    const next = defaultBusinessId(candidates, me.data.lastBusinessId ?? null);
    if (next !== undefined) setActiveBusinessId(next);
  }, [me.data, me.isError, active]);

  // Oturum cihazdaki anahtarla geri geldiyse profildeki dil bir kez uygulanır (girişte use-login).
  useEffect(() => {
    const userId = me.data?.id;
    if (userId === undefined || profileLanguageAppliedFor === userId) return;
    profileLanguageAppliedFor = userId;
    if (me.data?.preferredLanguage !== i18n.language) {
      void language.applyProfile(me.data?.preferredLanguage);
    }
  }, [me.data, i18n.language, language]);

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

/** Girişte use-login profili zaten uyguladı; aynı kullanıcı için tekrar uygulanmaz. */
export function markProfileLanguageApplied(userId: string | undefined): void {
  profileLanguageAppliedFor = userId;
}

/**
 * İşletme değiştir: seçim güncellenir, oturum dışındaki tüm sorgu önbelleği temizlenir (US-003 AC2)
 * ve seçim son kullanılan olarak yazılır (S8).
 */
export function useSelectBusiness(): (businessId: string) => void {
  const queryClient = useQueryClient();
  const remember = useRememberBusiness();
  return (businessId) => {
    setActiveBusinessId(businessId);
    queryClient.removeQueries({
      predicate: (query) => !KEPT_QUERIES.has(String(query.queryKey[0])),
    });
    remember.mutate(businessId);
  };
}
