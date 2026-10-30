// Giriş ekranlarının ortak durumu (F1.14a). Adım bilgisi (challengeId, pendingToken) yalnızca
// bellekte tutulur; yönlendirme parametresine veya depoya yazılmaz.
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { mobileApi, useStartSession } from '../../lib/session';
import { useLanguageController } from '../language/language-provider';
import { type LoginFlow, type LoginOutcome, type LoginStep, createLoginFlow } from './login-flow';

let current: { readonly phone: string; readonly step: LoginStep } | undefined;

export function currentLogin() {
  return current;
}

export function resetLogin(): void {
  current = undefined;
}

export function useLoginFlow(): LoginFlow {
  return useMemo(
    () =>
      createLoginFlow({
        client: mobileApi().client,
        device: { type: Platform.OS === 'ios' ? 'ios' : 'android' },
      }),
    [],
  );
}

/**
 * Sonucu işler: yeni adıma geçer, oturumu açar veya hata kodunu gösterir. `onStep` adımı ekranın
 * kendisi gösterecekse `true` döner (ör. TOTP kurulumu → kurtarma kodları).
 */
export function useLoginOutcome(phone: string, onStep?: (step: LoginStep) => boolean) {
  const router = useRouter();
  const startSession = useStartSession();
  const language = useLanguageController();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [unregistered, setUnregistered] = useState(false);

  async function handle(outcome: LoginOutcome) {
    if (outcome.kind === 'error') {
      setError(outcome.code);
      return;
    }
    if (outcome.kind === 'signed_in') {
      resetLogin();
      await startSession(outcome.tokens);
      // Girişte profildeki dil geçerli olur (US-058 AC1).
      const { data } = await mobileApi().client.GET('/api/v1/me');
      await language.applyProfile(data?.preferredLanguage);
      router.replace('/');
      return;
    }
    current = { phone, step: outcome.step };
    if (onStep?.(outcome.step) === true) return;
    if (outcome.step.kind === 'code') router.push('/code');
    else if (outcome.step.kind === 'register') setUnregistered(true);
    else router.replace('/totp');
  }

  async function run(action: () => Promise<LoginOutcome>) {
    setBusy(true);
    setError(undefined);
    try {
      await handle(await action());
    } catch {
      // Ağ hatası vb.: genel hata gösterilir.
      setError('INTERNAL_ERROR');
    } finally {
      setBusy(false);
    }
  }

  return { run, error, busy, unregistered };
}
