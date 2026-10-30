// Kök yerleşim (F1.14a): react-query, çeviriler, oturum süresi dolunca giriş ekranı.
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { resetLogin } from '../src/features/auth/use-login';
import { LanguageProvider } from '../src/features/language/language-provider';
import { ME_KEY, SESSION_KEY, setSessionExpiredHandler } from '../src/lib/session';

/** Yenileme reddedildi (ör. `REFRESH_TOKEN_REUSED`): oturum kapanır, giriş ekranı açılır. */
function SessionExpiryWatcher() {
  const router = useRouter();
  const queryClient = useQueryClient();
  useEffect(() => {
    setSessionExpiredHandler(() => {
      resetLogin();
      queryClient.setQueryData(SESSION_KEY, false);
      queryClient.removeQueries({ queryKey: ME_KEY });
      router.replace('/phone');
    });
    return () => {
      setSessionExpiredHandler(undefined);
    };
  }, [queryClient, router]);
  return null;
}

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <SessionExpiryWatcher />
        <Stack screenOptions={{ headerShown: false }} />
      </LanguageProvider>
    </QueryClientProvider>
  );
}
