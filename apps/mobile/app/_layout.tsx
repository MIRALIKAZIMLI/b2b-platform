// Kök yerleşim (F1.14a): react-query, çeviriler, oturum süresi dolunca giriş ekranı.
// F1.14b: zorunlu güncellemede (US-060 AC1) hiçbir ekran açılmaz; oturum açılınca push kaydı.
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { resetLogin } from '../src/features/auth/use-login';
import { LanguageProvider } from '../src/features/language/language-provider';
import { PushRegistrar } from '../src/features/shell/push-registrar';
import { useUpdateDecision } from '../src/features/shell/use-app-config';
import { UpdateRequired } from '../src/features/shell/update-required';
import {
  ME_KEY,
  SESSION_KEY,
  setActiveBusinessId,
  setSessionExpiredHandler,
} from '../src/lib/session';

/** Yenileme reddedildi (ör. `REFRESH_TOKEN_REUSED`): oturum kapanır, giriş ekranı açılır. */
function SessionExpiryWatcher() {
  const router = useRouter();
  const queryClient = useQueryClient();
  useEffect(() => {
    setSessionExpiredHandler(() => {
      resetLogin();
      queryClient.setQueryData(SESSION_KEY, false);
      queryClient.removeQueries({ queryKey: ME_KEY });
      setActiveBusinessId(undefined);
      router.replace('/phone');
    });
    return () => {
      setSessionExpiredHandler(undefined);
    };
  }, [queryClient, router]);
  return null;
}

/** Minimum sürümün altında yalnızca "Lütfen güncelleyin" (US-060 AC1). */
function UpdateGate() {
  const decision = useUpdateDecision();
  if (decision !== 'pending' && decision.kind === 'required') {
    return (
      <UpdateRequired
        {...(decision.storeUrl === undefined ? {} : { storeUrl: decision.storeUrl })}
      />
    );
  }
  return (
    <>
      <SessionExpiryWatcher />
      <PushRegistrar />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <UpdateGate />
      </LanguageProvider>
    </QueryClientProvider>
  );
}
