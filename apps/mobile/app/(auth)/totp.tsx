// Giriş 3/3: TOTP (platform rolleri, F1.6). Kurulum gerekiyorsa anahtar gösterilir, onaydan sonra
// kurtarma kodları bir kez gösterilir, ardından TOTP koduyla giriş.
import { Redirect } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, TextInput, View } from 'react-native';
import { authStyles as styles } from '../../src/features/auth/auth-styles';
import type { LoginStep } from '../../src/features/auth/login-flow';
import { currentLogin, useLoginFlow, useLoginOutcome } from '../../src/features/auth/use-login';

type TotpStep = Extract<LoginStep, { kind: 'totp' | 'totp_setup' | 'recovery' }>;

function isTotpStep(step: LoginStep | undefined): step is TotpStep {
  return step?.kind === 'totp' || step?.kind === 'totp_setup' || step?.kind === 'recovery';
}

export default function TotpScreen() {
  const { t } = useTranslation();
  const flow = useLoginFlow();
  const login = currentLogin();
  const [step, setStep] = useState<LoginStep | undefined>(login?.step);
  const [code, setCode] = useState('');
  const { run, error, busy } = useLoginOutcome(login?.phone ?? '', (next) => {
    if (!isTotpStep(next)) return false;
    setStep(next);
    return true;
  });

  if (!isTotpStep(step)) return <Redirect href="/phone" />;

  if (step.kind === 'recovery') {
    return (
      <View style={styles.screen}>
        <Text>{t('auth.login.recovery_codes_title')}</Text>
        {step.codes.map((recovery) => (
          <Text key={recovery} selectable style={styles.mono}>
            {recovery}
          </Text>
        ))}
        <Pressable
          style={styles.button}
          accessibilityRole="button"
          onPress={() => {
            setStep({ kind: 'totp', pendingToken: step.pendingToken });
          }}
        >
          <Text>{t('auth.login.continue')}</Text>
        </Pressable>
      </View>
    );
  }

  const { pendingToken } = step;
  function submit() {
    setCode('');
    const kind = step?.kind;
    void run(() =>
      kind === 'totp_setup'
        ? flow.confirmTotpSetup(pendingToken, code)
        : flow.verifyTotp(pendingToken, code),
    );
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title} accessibilityRole="header">
        {t('auth.login.title')}
      </Text>
      {step.kind === 'totp_setup' && (
        <>
          <Text>{t('auth.login.totp_setup_hint')}</Text>
          <Text selectable style={styles.mono}>
            {step.otpauthUri}
          </Text>
        </>
      )}
      <TextInput
        style={styles.input}
        value={code}
        onChangeText={setCode}
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        autoCapitalize="none"
        accessibilityLabel={t('auth.login.totp_label')}
      />
      <Pressable
        style={styles.button}
        accessibilityRole="button"
        disabled={busy || code.trim() === ''}
        onPress={submit}
      >
        <Text>{t('auth.login.verify')}</Text>
      </Pressable>
      {error !== undefined && <Text accessibilityRole="alert">{t(`errors.${error}`)}</Text>}
    </View>
  );
}
