'use client';
// Oturum durumu (F1.13a): tek `WebApi` örneği, react-query ile oturum ve `/me`.
// Erişim anahtarı yalnızca `webApi` içinde, bellekte; sayfa yenilenince cookie ile geri alınır.
// Seçili işletme de yalnızca bellekte (F1.13b): her istekte `X-Business-Id` olur; sayfa yenilenince
// varsayılan üyelik yeniden seçilir (F2.7b: son kullanılan işletme sunucuda, `/me.lastBusinessId`).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { createWebApi } from './api';

let language = 'az';
let expiredHandler: (() => void) | undefined;
let businessId: string | undefined;
const businessListeners = new Set<() => void>();

export const webApi = createWebApi({
  baseUrl: '',
  language: () => language,
  businessId: () => businessId,
  onSessionExpired: () => expiredHandler?.(),
});

export function setApiLanguage(next: string): void {
  language = next;
}

export function setSessionExpiredHandler(handler: (() => void) | undefined): void {
  expiredHandler = handler;
}

export const SESSION_KEY = ['session'] as const;
export const ME_KEY = ['me'] as const;

/** Seçili işletmeyi değiştirir (dinleyen bileşenler yeniden çizilir). Önbellek temizliği çağıranda. */
export function setActiveBusinessId(next: string | undefined): void {
  if (next === businessId) return;
  businessId = next;
  for (const listener of businessListeners) listener();
}

function subscribeBusiness(listener: () => void): () => void {
  businessListeners.add(listener);
  return () => {
    businessListeners.delete(listener);
  };
}

/** Seçili işletme kimliği (yoksa `undefined`). */
export function useActiveBusinessId(): string | undefined {
  return useSyncExternalStore(
    subscribeBusiness,
    () => businessId,
    () => undefined,
  );
}

/** `true`: oturum var. İlk çağrıda cookie ile sessiz yenileme denenir. */
export function useSession() {
  return useQuery({
    queryKey: SESSION_KEY,
    queryFn: async () => webApi.hasSession() || (await webApi.refresh()),
    staleTime: Infinity,
    retry: false,
  });
}

/** `/me`; işletme seçiliyse `activeBusiness` (izinler) da gelir. Anahtar işletmeye göre ayrı. */
export function useMe(enabled: boolean) {
  const active = useActiveBusinessId();
  return useQuery({
    queryKey: [...ME_KEY, active ?? null],
    enabled,
    retry: false,
    queryFn: async () => {
      const { data, response } = await webApi.client.GET('/api/v1/me');
      if (data === undefined) throw new Error(`/me: ${String(response.status)}`);
      return data;
    },
  });
}

/**
 * Son kullanılan işletmeyi sunucuya yazar (S8, `PATCH /me`). Yalnız kolaylıktır: başarısızlık
 * seçimi engellemez, react-query hatayı mutasyon durumunda tutar.
 */
export function useRememberBusiness() {
  return useMutation({
    mutationFn: async (next: string): Promise<void> => {
      await webApi.client.PATCH('/api/v1/me', { body: { lastBusinessId: next } });
    },
  });
}

/** Giriş başarılı: anahtar belleğe, oturum sorgusu güncellenir. */
export function useStartSession() {
  const queryClient = useQueryClient();
  return (accessToken: string) => {
    webApi.setAccessToken(accessToken);
    queryClient.setQueryData(SESSION_KEY, true);
    void queryClient.invalidateQueries({ queryKey: ME_KEY });
  };
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => webApi.logout(),
    onSettled: () => {
      setActiveBusinessId(undefined);
      queryClient.setQueryData(SESSION_KEY, false);
      queryClient.removeQueries({ queryKey: ME_KEY });
    },
  });
}
