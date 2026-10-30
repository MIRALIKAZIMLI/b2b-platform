'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { SESSION_KEY, setApiLanguage, setSessionExpiredHandler } from '../../lib/session';

/** React Query + oturum bitince giriş ekranı (F1.13-AC3). */
export function Providers({ locale, children }: { locale: string; children: ReactNode }) {
  const router = useRouter();
  const [queryClient] = useState(() => new QueryClient());
  setApiLanguage(locale);

  useEffect(() => {
    setSessionExpiredHandler(() => {
      queryClient.setQueryData(SESSION_KEY, false);
      queryClient.clear();
      router.replace(`/${locale}/login`);
    });
    return () => {
      setSessionExpiredHandler(undefined);
    };
  }, [locale, queryClient, router]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
