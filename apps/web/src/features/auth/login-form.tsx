'use client';
import type { components } from '@b2b/api-client';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type SyntheticEvent, useState } from 'react';
import { errorCodeOf as errorCode } from '../../lib/error-code';
import { useStartSession, webApi } from '../../lib/session';
import { BuyerRegistrationForm } from '../buyer-registration/registration-form';
import { Button, Field, TextInput } from '../ui/primitives';

type AuthResult = components['schemas']['AuthResult'];

type Step =
  | { readonly kind: 'phone' }
  | { readonly kind: 'code'; readonly challengeId: string }
  | { readonly kind: 'totp'; readonly pendingToken: string }
  | { readonly kind: 'totp_setup'; readonly pendingToken: string; readonly otpauthUri: string }
  | { readonly kind: 'recovery'; readonly pendingToken: string; readonly codes: readonly string[] }
  | { readonly kind: 'register'; readonly pendingToken: string };

const LOCALES = ['az', 'ru', 'tr', 'en'];

/**
 * `onSignedIn` verilirse oturum açılınca yönlendirme yapılmaz, çağıran devam eder (aktivasyon
 * sayfası, F2.1b: davet token'ı yalnız o sayfanın belleğindedir). `intent = 'register'` kayıt
 * sayfasının başlığını gösterir (F2.3b); akış aynıdır: kayıtsız numara OTP'den sonra kayıt
 * formuna, kayıtlı numara doğrudan oturuma geçer.
 */
export function LoginForm({
  onSignedIn,
  intent = 'login',
}: { onSignedIn?: () => void; intent?: 'login' | 'register' } = {}) {
  const t = useTranslations('auth.login');
  const tRegister = useTranslations('register');
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
    } else if (result.nextStep === 'register' && result.pendingToken !== undefined) {
      // Kayıt anahtarı yalnız bu bileşenin belleğinde (coding-guidelines §9.6).
      setStep({ kind: 'register', pendingToken: result.pendingToken });
    } else {
      setError('INTERNAL_ERROR');
    }
  }

  function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(async () => {
      switch (step.kind) {
        case 'phone': {
          const { data, error: e } = await webApi.client.POST('/api/v1/auth/otp/request', {
            body: { phone: phone.trim(), purpose: intent },
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
    <Field id="login-code" label={label}>
      <TextInput
        id="login-code"
        name="code"
        value={code}
        onChange={(event) => {
          setCode(event.target.value);
        }}
        inputMode={step.kind === 'code' ? 'numeric' : 'text'}
        autoComplete={autoComplete}
        className="tabular-nums tracking-widest"
        required
      />
    </Field>
  );

  const hint = 'text-sm font-normal text-slate-500';

  if (step.kind === 'register') {
    return (
      <BuyerRegistrationForm
        pendingToken={step.pendingToken}
        phone={phone.trim()}
        onSignedIn={finish}
        onRestart={() => {
          setCode('');
          setStep({ kind: 'phone' });
        }}
      />
    );
  }

  return (
    <form onSubmit={onSubmit} aria-busy={busy} className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {intent === 'register' ? tRegister('title') : t('title')}
        </h1>
        {intent === 'register' && step.kind === 'phone' && (
          <p className={hint}>{tRegister('intro')}</p>
        )}
      </div>
      {step.kind === 'phone' && (
        <>
          <Field id="login-phone" label={t('phone_label')}>
            <TextInput
              id="login-phone"
              name="phone"
              type="tel"
              value={phone}
              onChange={(event) => {
                setPhone(event.target.value);
              }}
              autoComplete="tel"
              required
            />
          </Field>
          <Button type="submit" className="w-full" disabled={busy}>
            {t('send_code')}
          </Button>
        </>
      )}
      {step.kind === 'code' && (
        <>
          <p className={hint}>{t('code_sent', { phone })}</p>
          {codeField(t('code_label'), 'one-time-code')}
          <div className="flex flex-col gap-2">
            <Button type="submit" disabled={busy}>
              {t('verify')}
            </Button>
            <Button
              variant="quiet-danger"
              className="hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900"
              onClick={() => {
                setStep({ kind: 'phone' });
              }}
            >
              {t('change_phone')}
            </Button>
          </div>
        </>
      )}
      {(step.kind === 'totp' || step.kind === 'totp_setup') && (
        <>
          {step.kind === 'totp_setup' && (
            <div className="space-y-2">
              <p className={hint}>{t('totp_setup_hint')}</p>
              <code className="block rounded-xl bg-slate-50 px-3 py-2 font-mono text-xs break-all text-slate-700 ring-1 ring-slate-200/80">
                {step.otpauthUri}
              </code>
            </div>
          )}
          {codeField(t('totp_label'), 'one-time-code')}
          <Button type="submit" className="w-full" disabled={busy}>
            {t('verify')}
          </Button>
        </>
      )}
      {step.kind === 'recovery' && (
        <>
          <p className="text-sm font-semibold text-slate-900">{t('recovery_codes_title')}</p>
          <ul className="grid grid-cols-2 gap-2">
            {step.codes.map((recovery) => (
              <li key={recovery}>
                <code className="block rounded-xl bg-slate-50 px-3 py-2 text-center font-mono text-sm tabular-nums text-slate-900 ring-1 ring-slate-200/80">
                  {recovery}
                </code>
              </li>
            ))}
          </ul>
          <Button type="submit" className="w-full">
            {t('continue')}
          </Button>
        </>
      )}
      {error !== undefined && (
        <p
          role="alert"
          className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-700 ring-1 ring-rose-600/10"
        >
          {tErrors(error)}
        </p>
      )}
    </form>
  );
}
