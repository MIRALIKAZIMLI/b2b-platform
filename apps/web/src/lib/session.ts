'use client';
// Oturum durumu (F1.13a): tek `WebApi` örneği, react-query ile oturum ve `/me`.
// Erişim anahtarı yalnızca `webApi` içinde, bellekte; sayfa yenilenince cookie ile geri alınır.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createWebApi } from './api';

let language = 'az';
let expiredHandler: (() => void) | undefined;

export const webApi = createWebApi({
  baseUrl: '',
  language: () => language,
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

/** `true`: oturum var. İlk çağrıda cookie ile sessiz yenileme denenir. */
export function useSession() {
  return useQuery({
    queryKey: SESSION_KEY,
    queryFn: async () => webApi.hasSession() || (await webApi.refresh()),
    staleTime: Infinity,
    retry: false,
  });
}

export function useMe(enabled: boolean) {
  return useQuery({
    queryKey: ME_KEY,
    enabled,
    queryFn: async () => {
      const { data, response } = await webApi.client.GET('/api/v1/me');
      if (data === undefined) throw new Error(`/me: ${String(response.status)}`);
      return data;
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
      queryClient.setQueryData(SESSION_KEY, false);
      queryClient.removeQueries({ queryKey: ME_KEY });
    },
  });
}
