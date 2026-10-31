'use client';
// Toptancı aktivasyonu (F2.1b, US-009 AC2–AC3; SF "admin toptancı açar"). Token adresten okunur,
// hemen `history.replaceState` ile silinir ve yalnız bu bileşenin belleğinde (ref) kalır. Oturum yoksa
// giriş akışı aynı sayfada (F1.13a `LoginForm`), böylece token yönlendirmede kaybolmaz. Giriş sonrası
// `POST /team/invitations/accept` → yeni işletme seçilir → `/seller`. Her başarısız kabul aynı `404`
// (F2.1a K2) → tek açıklayıcı mesaj.
import { useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { errorCodeOf } from '../../lib/error-code';
import { ME_KEY, setActiveBusinessId, useSession, webApi } from '../../lib/session';
import { LoginForm } from '../auth/login-form';
import { landingPath } from '../shell/landing';
import { addressWithoutToken, readActivationToken } from './token';

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
  const token = useRef<string | undefined>(undefined);
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
      setActiveBusinessId(data.businessId);
      await queryClient.invalidateQueries({ queryKey: ME_KEY });
      router.replace(landingPath(locale, 'seller'));
    } catch (failure) {
      setPhase({ kind: 'failed', code: errorCodeOf(failure) });
    } finally {
      accepting.current = false;
    }
  }, [locale, queryClient, router]);

  // Oturum zaten varsa (veya giriş bittiyse) doğrudan kabul.
  useEffect(() => {
    if (phase.kind === 'ready' && session.data === true) void accept();
  }, [phase.kind, session.data, accept]);

  return (
    <>
      <h1>{t('title')}</h1>
      {(phase.kind === 'reading' || (phase.kind === 'ready' && session.isPending)) && (
        <p role="status">{tCommon('loading')}</p>
      )}
      {phase.kind === 'ready' && session.data === false && (
        <>
          <p>{t('intro')}</p>
          <LoginForm
            onSignedIn={() => {
              void accept();
            }}
          />
        </>
      )}
      {phase.kind === 'accepting' && <p role="status">{t('accepting')}</p>}
      {phase.kind === 'invalid' && <p role="alert">{t('invalid')}</p>}
      {phase.kind === 'failed' && (
        <>
          <p role="alert">{tErrors(phase.code)}</p>
          <button
            type="button"
            onClick={() => {
              void accept();
            }}
          >
            {t('retry')}
          </button>
        </>
      )}
    </>
  );
}
