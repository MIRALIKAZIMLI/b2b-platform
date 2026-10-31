// Dil seçici (US-058 AC1). Seçim `LanguageController` üzerinden; hata olursa dil değişmez.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '../../lib/i18n';
import { useLanguageController } from './language-provider';

export function LanguagePicker() {
  const { t, i18n } = useTranslation();
  const controller = useLanguageController();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function choose(lang: SupportedLanguage) {
    if (busy || lang === i18n.language) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await controller.change(lang);
      if (!result.ok) setError(result.code);
    } catch {
      setError('INTERNAL_ERROR');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.box}>
      <Text>{t('common.language')}</Text>
      <View style={styles.row}>
        {SUPPORTED_LANGUAGES.map((lang) => (
          <Pressable
            key={lang}
            accessibilityRole="button"
            accessibilityState={{ selected: lang === i18n.language, disabled: busy }}
            onPress={() => void choose(lang)}
            style={[styles.option, lang === i18n.language && styles.selected]}
          >
            <Text>{t(`languages.${lang}`)}</Text>
          </Pressable>
        ))}
      </View>
      {error !== undefined && <Text accessibilityRole="alert">{t(`errors.${error}`)}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  option: { paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderRadius: 6 },
  selected: { borderWidth: 2 },
});
