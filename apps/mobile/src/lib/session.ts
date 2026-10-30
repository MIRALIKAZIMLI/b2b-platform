// Mobil oturum (F1.14a). Yenileme anahtarı yalnızca `expo-secure-store`'da (Android Keystore /
// iOS Keychain; ADR-0006 madde 3, TM-04). AsyncStorage veya düz dosya kullanılmaz; anahtar loga ve
// hata mesajına yazılmaz. Erişim anahtarı yalnızca `MobileApi` belleğinde.
// Seçili işletme yalnızca bellekte; seçici F1.14b'de.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import { type MobileApi, type RefreshTokenStore, type TokenPair, createMobileApi } from './api';
import { apiBaseUrl } from './config';

/** Güvenli depodaki anahtarın adı (değer değil). */
export const REFRESH_TOKEN_KEY = 'b2b.refresh_token';

type SecureStoreApi = Pick<typeof SecureStore, 'getItemAsync' | 'setItemAsync' | 'deleteItemAsync'>;

export function createSecureRefreshTokenStore(
  secureStore: SecureStoreApi = SecureStore,
): RefreshTokenStore {
  return {
    async read() {
      const value = await secureStore.getItemAsync(REFRESH_TOKEN_KEY);
      return value === null || value === '' ? undefined : value;
    },
    write: (token) => secureStore.setItemAsync(REFRESH_TOKEN_KEY, token),
    clear: () => secureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
  };
}

let language = 'az';
let businessId: string | undefined;
let expiredHandler: (() => void) | undefined;
let instance: MobileApi | undefined;

/** Uygulamanın tek API istemcisi (ilk çağrıda kurulur; adres `EXPO_PUBLIC_API_URL`). */
export function mobileApi(): MobileApi {
  instance ??= createMobileApi({
    baseUrl: apiBaseUrl(),
    language: () => language,
    businessId: () => businessId,
    store: createSecureRefreshTokenStore(),
    onSessionExpired: () => expiredHandler?.(),
  });
  return instance;
}

export function setApiLanguage(next: string): void {
  language = next;
}

export function setActiveBusinessId(next: string | undefined): void {
  businessId = next;
}

export function setSessionExpiredHandler(handler: (() => void) | undefined): void {
  expiredHandler = handler;
}

export const SESSION_KEY = ['session'] as const;
export const ME_KEY = ['me'] as const;

/** `true`: oturum var. İlk çağrıda güvenli depodaki anahtarla sessiz yenileme denenir. */
export function useSession() {
  return useQuery({
    queryKey: SESSION_KEY,
    queryFn: async () => mobileApi().hasSession() || (await mobileApi().refresh()),
    staleTime: Infinity,
    retry: false,
  });
}

export function useMe(enabled: boolean) {
  return useQuery({
    queryKey: ME_KEY,
    enabled,
    retry: false,
    queryFn: async () => {
      const { data, response } = await mobileApi().client.GET('/api/v1/me');
      if (data === undefined) throw new Error(`/me: ${String(response.status)}`);
      return data;
    },
  });
}

/** Giriş başarılı: anahtarlar yerine konur, oturum sorgusu güncellenir. */
export function useStartSession() {
  const queryClient = useQueryClient();
  return async (tokens: TokenPair) => {
    await mobileApi().startSession(tokens);
    queryClient.setQueryData(SESSION_KEY, true);
    await queryClient.invalidateQueries({ queryKey: ME_KEY });
  };
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => mobileApi().logout(),
    onSettled: () => {
      setActiveBusinessId(undefined);
      queryClient.setQueryData(SESSION_KEY, false);
      queryClient.removeQueries({ queryKey: ME_KEY });
    },
  });
}
