// Açılışta sunucuya ulaşılamadı (Müfettiş #33 L1): giriş ekranı yerine "Yeniden dene".
// Yenileme anahtarı cihazda kalır; bağlantı gelince oturum geri alınır.
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { shellStyles } from './shell-styles';

export function OfflineRetry({
  onRetry,
  busy,
}: {
  readonly onRetry: () => void;
  readonly busy: boolean;
}) {
  const { t } = useTranslation();
  return (
    <View style={shellStyles.center} testID="offline-retry">
      <Text style={shellStyles.title}>{t('shell.offline.title')}</Text>
      <Text>{t('shell.offline.body')}</Text>
      <Pressable
        style={[shellStyles.button, busy && shellStyles.disabled]}
        accessibilityRole="button"
        disabled={busy}
        onPress={onRetry}
      >
        <Text>{t('shell.offline.retry')}</Text>
      </Pressable>
    </View>
  );
}
