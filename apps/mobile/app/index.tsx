// Açılış (F1.14a): oturum yoksa giriş ekranı; varsa yer tutucu (menü ve işletme seçici F1.14b).
import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { LanguagePicker } from '../src/features/language/language-picker';
import { useLogout, useSession } from '../src/lib/session';

export default function HomeScreen() {
  const { t } = useTranslation();
  const session = useSession();
  const logout = useLogout();

  if (session.isPending) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  if (session.data !== true) return <Redirect href="/phone" />;

  return (
    <View style={styles.screen}>
      <Text>{t('shell.dashboard_soon')}</Text>
      <LanguagePicker />
      <Pressable
        style={styles.button}
        accessibilityRole="button"
        disabled={logout.isPending}
        onPress={() => {
          logout.mutate();
        }}
      >
        <Text>{t('common.logout')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  screen: { flex: 1, padding: 24, gap: 16, justifyContent: 'center' },
  button: { borderWidth: 1, borderRadius: 6, padding: 12, alignItems: 'center' },
});
