'use client';
import type { components } from '@b2b/api-client';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type SyntheticEvent, useState } from 'react';
import { errorCodeOf as errorCode } from '../../lib/error-code';
import { useStartSession, webApi } from '../../lib/session';

type AuthResult = components['schemas']['AuthResult'];

type Step =
  | { readonly kind: 'phone' }
  | { readonly kind: 'code'; readonly challengeId: string }
  | { readonly kind: 'totp'; readonly pendingToken: string }
  | { readonly kind: 'totp_setup'; readonly pendingToken: string; readonly otpauthUri: string }
  | { readonly kind: 'recovery'; readonly pendingToken: string; readonly codes: readonly string[] }
  | { readonly kind: 'register' };

const LOCALES = ['az', 'ru', 'tr', 'en'];

/**
 * `onSignedIn` verilirse oturum açılınca yönlendirme yapılmaz, çağıran devam eder (aktivasyon
 * sayfası, F2.1b: davet token'ı yalnız o sayfanın belleğindedir).
 */
export function LoginForm({ onSignedIn }: { onSignedIn?: () => void } = {}) {
  const t = useTranslations('auth.login');
  const tErrors = useTranslations('errors');
  const locale = useLocale();
  const router = useRouter();
  const startSession = useStartSession();
  const [step, setStep] = useState<Step>({ kind: 'phone' });
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (failure) {
      // Ağ hatası vb.: kullanıcıya genel hata gösterilir (Müfettiş L2).
      setError(errorCode(failure));
    } finally {
      setBusy(false);
    }
  }

  /** Oturum açıldı: profildeki dil farklıysa o dile geç (US-058 AC1). */
  async function finish(accessToken: string) {
    startSession(accessToken);
    if (onSignedIn !== undefined) {
      onSignedIn();
      return;
    }
    const { data } = await webApi.client.GET('/api/v1/me');
    // Kayıtta dil boş olabilir (null); yalnızca bilinen bir dil yönlendirir.
    const preferred: string = data?.preferredLanguage ?? '';
    const target = LOCALES.includes(preferred) ? preferred : locale;
    router.replace(`/${target}`);
  }

  async function handleAuthResult(result: AuthResult) {
    setCode('');
    if (result.nextStep === 'none' && result.accessToken !== undefined) {
      await finish(result.accessToken);
    } else if (result.nextStep === 'totp' && result.pendingToken !== undefined) {
      setStep({ kind: 'totp', pendingToken: result.pendingToken });
    } else if (result.nextStep === 'totp_setup' && result.pendingToken !== undefined) {
      const pendingToken = result.pendingToken;
      const { data, error: setupError } = await webApi.client.POST('/api/v1/auth/totp/setup', {
        headers: { Authorization: `Bearer ${pendingToken}` },
        body: {},
      });
      if (data?.otpauthUri === undefined) {
        setError(errorCode(setupError));
        return;
      }
      setStep({ kind: 'totp_setup', pendingToken, otpauthUri: data.otpauthUri });
    } else {
      setStep({ kind: 'register' });
    }
  }

  function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(async () => {
      switch (step.kind) {
        case 'phone': {
          const { data, error: e } = await webApi.client.POST('/api/v1/auth/otp/request', {
            body: { phone: phone.trim(), purpose: 'login' },
          });
          if (data === undefined) {
            setError(errorCode(e));
            return;
          }
          setStep({ kind: 'code', challengeId: data.challengeId });
          return;
        }
        case 'code': {
          const { data, error: e } = await webApi.client.POST('/api/v1/auth/otp/verify', {
            body: { challengeId: step.challengeId, code: code.trim(), device: { type: 'web' } },
          });
          if (data === undefined) {
            setError(errorCode(e));
            return;
          }
          await handleAuthResult(data);
          return;
        }
        case 'totp': {
          const { data, error: e } = await webApi.client.POST('/api/v1/auth/totp/verify', {
            body: { pendingToken: step.pendingToken, code: code.trim(), device: { type: 'web' } },
          });
          if (data === undefined) {
            setError(errorCode(e));
            return;
          }
          await handleAuthResult(data);
          return;
        }
        case 'totp_setup': {
          const { data, error: e } = await webApi.client.POST('/api/v1/auth/totp/setup', {
            headers: { Authorization: `Bearer ${step.pendingToken}` },
            body: { confirmCode: code.trim() },
          });
          if (data?.recoveryCodes === undefined) {
            setError(errorCode(e));
            return;
          }
          setCode('');
          setStep({ kind: 'recovery', pendingToken: step.pendingToken, codes: data.recoveryCodes });
          return;
        }
        case 'recovery':
          setStep({ kind: 'totp', pendingToken: step.pendingToken });
          return;
        case 'register':
          return;
      }
    });
  }

  const codeField = (label: string, autoComplete: string) => (
    <label>
      {label}
      <input
        name="code"
        value={code}
        onChange={(event) => {
          setCode(event.target.value);
        }}
        inputMode={step.kind === 'code' ? 'numeric' : 'text'}
        autoComplete={autoComplete}
        required
      />
    </label>
  );

  return (
    <form onSubmit={onSubmit} aria-busy={busy}>
      <h1>{t('title')}</h1>
      {step.kind === 'phone' && (
        <>
          <label>
            {t('phone_label')}
            <input
              name="phone"
              type="tel"
              value={phone}
              onChange={(event) => {
                setPhone(event.target.value);
              }}
              autoComplete="tel"
              required
            />
          </label>
          <button type="submit" disabled={busy}>
            {t('send_code')}
          </button>
        </>
      )}
      {step.kind === 'code' && (
        <>
          <p>{t('code_sent', { phone })}</p>
          {codeField(t('code_label'), 'one-time-code')}
          <button type="submit" disabled={busy}>
            {t('verify')}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep({ kind: 'phone' });
            }}
          >
            {t('change_phone')}
          </button>
        </>
      )}
      {(step.kind === 'totp' || step.kind === 'totp_setup') && (
        <>
          {step.kind === 'totp_setup' && (
            <>
              <p>{t('totp_setup_hint')}</p>
              <code>{step.otpauthUri}</code>
            </>
          )}
          {codeField(t('totp_label'), 'one-time-code')}
          <button type="submit" disabled={busy}>
            {t('verify')}
          </button>
        </>
      )}
      {step.kind === 'recovery' && (
        <>
          <p>{t('recovery_codes_title')}</p>
          <ul>
            {step.codes.map((recovery) => (
              <li key={recovery}>
                <code>{recovery}</code>
              </li>
            ))}
          </ul>
          <button type="submit">{t('continue')}</button>
        </>
      )}
      {step.kind === 'register' && <p>{t('register_soon')}</p>}
      {error !== undefined && <p role="alert">{tErrors(error)}</p>}
    </form>
  );
}
