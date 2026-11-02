'use client';
// Toptancı aktivasyonu (F2.1b, US-009 AC2–AC3; SF "admin toptancı açar"). Token adresten okunur,
// hemen `history.replaceState` ile silinir ve yalnız bu bileşenin belleğinde (ref) kalır. Oturum yoksa
// giriş akışı aynı sayfada (F1.13a `LoginForm`), böylece token yönlendirmede kaybolmaz. Giriş sonrası
// `POST /team/invitations/accept` → yeni işletme seçilir ve son kullanılan olarak yazılır (S8) →
// ana sayfa işletmenin alanına yönlendirir (F2.7b: ekip daveti `buyer` da olabilir). Her başarısız
// kabul aynı `404` (F2.1a K2) → tek açıklayıcı mesaj. F2.7b: ekip daveti için ek açıklama; telefonda
// "Uygulamada aç" (`b2b://activate?token=`, mobil `(auth)/activate`).
import { useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { errorCodeOf } from '../../lib/error-code';
import {
  ME_KEY,
  setActiveBusinessId,
  useRememberBusiness,
  useSession,
  webApi,
} from '../../lib/session';
import { LoginForm } from '../auth/login-form';
import { Button, Card } from '../ui/primitives';
import { addressWithoutToken, appLink, isPhoneBrowser, readActivationToken } from './token';

type Phase =
  | { readonly kind: 'reading' }
  | { readonly kind: 'ready' }
  | { readonly kind: 'accepting' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'failed'; readonly code: string };

export function ActivateView() {
  const t = useTranslations('activate');
  const tErrors = useTranslations('errors');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useSession();
  const remember = useRememberBusiness();
  const token = useRef<string | undefined>(undefined);
  const [appHref, setAppHref] = useState<string | undefined>();
  const captured = useRef(false);
  const accepting = useRef(false);
  const [phase, setPhase] = useState<Phase>({ kind: 'reading' });

  // Bir kez: token belleğe, adres çubuğundan (ve geçmişten) silinir (F2.1b-AC4).
  useEffect(() => {
    if (captured.current) return;
    captured.current = true;
    const { pathname, search, hash } = window.location;
    token.current = readActivationToken(search);
    if (search !== '') {
      window.history.replaceState(null, '', addressWithoutToken(pathname, search, hash));
    }
    if (token.current !== undefined && isPhoneBrowser(window.navigator.userAgent)) {
      setAppHref(appLink(token.current));
    }
    setPhase(token.current === undefined ? { kind: 'invalid' } : { kind: 'ready' });
  }, []);

  const accept = useCallback(async () => {
    const value = token.current;
    if (value === undefined || accepting.current) return;
    accepting.current = true;
    setPhase({ kind: 'accepting' });
    try {
      const { data, error, response } = await webApi.client.POST(
        '/api/v1/team/invitations/accept',
        { body: { token: value } },
      );
      if (data === undefined) {
        if (response.status === 404) {
          token.current = undefined;
          setPhase({ kind: 'invalid' });
        } else {
          setPhase({ kind: 'failed', code: errorCodeOf(error) });
        }
        return;
      }
      token.current = undefined;
      setAppHref(undefined);
      setActiveBusinessId(data.businessId);
      remember.mutate(data.businessId);
      await queryClient.invalidateQueries({ queryKey: ME_KEY });
      router.replace(`/${locale}`);
    } catch (failure) {
      setPhase({ kind: 'failed', code: errorCodeOf(failure) });
    } finally {
      accepting.current = false;
    }
  }, [locale, queryClient, router, remember]);

  // Oturum zaten varsa (veya giriş bittiyse) doğrudan kabul.
  useEffect(() => {
    if (phase.kind === 'ready' && session.data === true) void accept();
  }, [phase.kind, session.data, accept]);

  const muted = 'text-sm text-slate-500';
  const status = 'text-sm font-medium text-slate-600';
  return (
    <div className="mx-auto w-full max-w-md space-y-6 px-4 py-12 sm:py-16">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('title')}</h1>
        {phase.kind !== 'invalid' && <p className={muted}>{t('team_intro')}</p>}
      </div>
      <Card className="space-y-5 p-6 sm:p-8">
        {(phase.kind === 'reading' || (phase.kind === 'ready' && session.isPending)) && (
          <p role="status" className={status}>
            {tCommon('loading')}
          </p>
        )}
        {phase.kind === 'ready' && session.data === false && (
          <>
            {appHref !== undefined && (
              <a
                href={appHref}
                data-testid="open-in-app"
                className="flex w-full items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-indigo-500/20 transition-all duration-200 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none"
              >
                {t('open_in_app')}
              </a>
            )}
            <p className={muted}>{t('intro')}</p>
            <LoginForm
              onSignedIn={() => {
                void accept();
              }}
            />
          </>
        )}
        {phase.kind === 'accepting' && (
          <p role="status" className={status}>
            {t('accepting')}
          </p>
        )}
        {phase.kind === 'invalid' && (
          <div className="space-y-2">
            <p role="alert" className="text-sm font-medium text-rose-700">
              {t('invalid')}
            </p>
            <p className={muted}>{t('team_invalid_hint')}</p>
          </div>
        )}
        {phase.kind === 'failed' && (
          <>
            <p role="alert" className="text-sm font-medium text-rose-700">
              {tErrors(phase.code)}
            </p>
            <Button
              variant="secondary"
              onClick={() => {
                void accept();
              }}
            >
              {t('retry')}
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
