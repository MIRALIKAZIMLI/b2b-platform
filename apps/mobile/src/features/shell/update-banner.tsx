// Kapatılabilir güncelleme önerisi (US-060 AC2).
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, Text, View } from 'react-native';
import { shellStyles } from './shell-styles';
import { dismissUpdateRecommendation, useUpdateDecision } from './use-app-config';

export function UpdateBanner() {
  const { t } = useTranslation();
  const decision = useUpdateDecision();
  if (decision === 'pending' || decision.kind !== 'recommended') return null;
  const { storeUrl } = decision;
  return (
    <View style={shellStyles.banner} testID="update-banner">
      <Text>{t('shell.update.recommended_body')}</Text>
      <View style={shellStyles.row}>
        {storeUrl !== undefined && (
          <Pressable
            style={shellStyles.option}
            accessibilityRole="link"
            onPress={() => void Linking.openURL(storeUrl)}
          >
            <Text>{t('shell.update.open_store')}</Text>
          </Pressable>
        )}
        <Pressable
          style={shellStyles.option}
          accessibilityRole="button"
          onPress={dismissUpdateRecommendation}
        >
          <Text>{t('shell.update.dismiss')}</Text>
        </Pressable>
      </View>
    </View>
  );
}
