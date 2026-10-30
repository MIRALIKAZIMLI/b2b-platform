// Giriş 1/3: telefon numarası (US-001).
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, TextInput, View } from 'react-native';
import { authStyles as styles } from '../../src/features/auth/auth-styles';
import { useLoginFlow, useLoginOutcome } from '../../src/features/auth/use-login';
import { LanguagePicker } from '../../src/features/language/language-picker';

export default function PhoneScreen() {
  const { t } = useTranslation();
  const flow = useLoginFlow();
  const [phone, setPhone] = useState('');
  const { run, error, busy } = useLoginOutcome(phone);

  return (
    <View style={styles.screen}>
      <Text style={styles.title} accessibilityRole="header">
        {t('auth.login.title')}
      </Text>
      <Text>{t('auth.login.phone_label')}</Text>
      <TextInput
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        accessibilityLabel={t('auth.login.phone_label')}
      />
      <Pressable
        style={styles.button}
        accessibilityRole="button"
        disabled={busy || phone.trim() === ''}
        onPress={() => void run(() => flow.requestCode(phone))}
      >
        <Text>{t('auth.login.send_code')}</Text>
      </Pressable>
      {error !== undefined && <Text accessibilityRole="alert">{t(`errors.${error}`)}</Text>}
      <LanguagePicker />
    </View>
  );
}
