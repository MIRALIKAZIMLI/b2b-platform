// Giriş 1/3: telefon numarası (US-001). Kayıtsız numara SMS kodundan sonra kayda geçer (F2.3b);
// alttaki bilgi kartı bunu perakendeciye söyler.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { authStyles as styles } from '../../src/features/auth/auth-styles';
import { useLoginFlow, useLoginOutcome } from '../../src/features/auth/use-login';
import { LanguagePicker } from '../../src/features/language/language-picker';
import { colors, radius, softShadow, space } from '../../src/lib/theme';

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
        testID="phone-input"
      />
      <Pressable
        style={styles.button}
        accessibilityRole="button"
        testID="send-code"
        disabled={busy || phone.trim() === ''}
        onPress={() => void run(() => flow.requestCode(phone))}
      >
        <Text>{t('auth.login.send_code')}</Text>
      </Pressable>
      {error !== undefined && <Text accessibilityRole="alert">{t(`errors.${error}`)}</Text>}
      <View style={entry.card} testID="register-entry">
        <Text style={entry.title}>{t('register.entry_title')}</Text>
        <Text style={entry.body}>{t('register.entry_body')}</Text>
      </View>
      <LanguagePicker />
    </View>
  );
}

const entry = StyleSheet.create({
  card: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(199, 210, 254, 0.8)',
    padding: space.lg,
    gap: space.xs,
    ...softShadow(1),
  },
  title: { fontSize: 15, fontWeight: '700', color: colors.text },
  body: { fontSize: 14, lineHeight: 20, color: colors.textMuted },
});
