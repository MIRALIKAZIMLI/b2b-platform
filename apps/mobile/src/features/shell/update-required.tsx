// "Lütfen güncelleyin" ekranı (US-060 AC1). Uygulamanın geri kalanı açılmaz; bağlantı ayarlıysa
// mağaza (veya test dağıtım) sayfası açılır. Bağlantı ayarlanmamışsa yalnızca metin.
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, Text, View } from 'react-native';
import { shellStyles } from './shell-styles';

export function UpdateRequired({ storeUrl }: { readonly storeUrl?: string }) {
  const { t } = useTranslation();
  return (
    <View style={shellStyles.center} testID="update-required">
      <Text style={shellStyles.title}>{t('shell.update.required_title')}</Text>
      <Text>{t('shell.update.required_body')}</Text>
      {storeUrl !== undefined && (
        <Pressable
          style={shellStyles.button}
          accessibilityRole="link"
          onPress={() => void Linking.openURL(storeUrl)}
        >
          <Text>{t('shell.update.open_store')}</Text>
        </Pressable>
      )}
    </View>
  );
}
