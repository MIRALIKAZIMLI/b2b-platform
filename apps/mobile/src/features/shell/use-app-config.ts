// Açılış sürüm kontrolü sorgusu (US-060). Yanıt gelmezse uygulama engellenmez; öneri kapatılırsa
// bu uygulama ömründe tekrar gösterilmez (US-060 AC2 "kapatılabilir").
import { useQuery } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import {
  APP_CONFIG_KEY,
  type UpdateDecision,
  decideUpdate,
  getAppConfig,
} from '../../lib/app-config';
import { appPlatform, appVersion } from '../../lib/app-info';
import { mobileApi } from '../../lib/session';

let dismissed = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function dismissUpdateRecommendation(): void {
  dismissed = true;
  for (const listener of listeners) listener();
}

/** `pending`: yanıt bekleniyor. Hata → `none` (uygulama açılır). */
export function useUpdateDecision(): UpdateDecision | 'pending' {
  const isDismissed = useSyncExternalStore(
    subscribe,
    () => dismissed,
    () => dismissed,
  );
  const version = appVersion();
  const query = useQuery({
    queryKey: [...APP_CONFIG_KEY, appPlatform, version],
    queryFn: async () => (await getAppConfig(mobileApi().client, appPlatform, version)) ?? null,
    staleTime: Infinity,
    retry: false,
  });
  if (query.isPending) return 'pending';
  return decideUpdate(query.data ?? undefined, version, isDismissed);
}
