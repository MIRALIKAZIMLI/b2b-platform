// Giriş 2/3: SMS kodu (US-001). Kayıtsız numara → bilgi (kayıt F2.3).
import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, TextInput, View } from 'react-native';
import { authStyles as styles } from '../../src/features/auth/auth-styles';
import { currentLogin, useLoginFlow, useLoginOutcome } from '../../src/features/auth/use-login';

export default function CodeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const flow = useLoginFlow();
  const login = currentLogin();
  const [code, setCode] = useState('');
  const { run, error, busy, unregistered } = useLoginOutcome(login?.phone ?? '');

  if (login?.step.kind !== 'code') return <Redirect href="/phone" />;
  const { challengeId } = login.step;

  return (
    <View style={styles.screen}>
      <Text style={styles.title} accessibilityRole="header">
        {t('auth.login.title')}
      </Text>
      <Text>{t('auth.login.code_sent', { phone: login.phone })}</Text>
      <TextInput
        style={styles.input}
        value={code}
        onChangeText={setCode}
        keyboardType="number-pad"
        autoComplete="sms-otp"
        textContentType="oneTimeCode"
        accessibilityLabel={t('auth.login.code_label')}
      />
      <Pressable
        style={styles.button}
        accessibilityRole="button"
        disabled={busy || code.trim() === ''}
        onPress={() => void run(() => flow.verifyCode(challengeId, code))}
      >
        <Text>{t('auth.login.verify')}</Text>
      </Pressable>
      <Pressable
        style={styles.link}
        accessibilityRole="button"
        onPress={() => {
          router.back();
        }}
      >
        <Text>{t('auth.login.change_phone')}</Text>
      </Pressable>
      {unregistered && <Text>{t('auth.login.register_soon')}</Text>}
      {error !== undefined && <Text accessibilityRole="alert">{t(`errors.${error}`)}</Text>}
    </View>
  );
}
