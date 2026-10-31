// Alan açılış sayfası (dashboard yer tutucusu) + izinden menü + işletme seçici + dil + çıkış.
// Menü yalnızca görünümdür; asıl yetki kontrolü API'dedir. Yapılmamış ekran bağlantısız (F2+).
import type { components } from '@b2b/api-client';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLogout } from '../../lib/session';
import { LanguagePicker } from '../language/language-picker';
import { BusinessSelector } from './business-selector';
import { type MobileArea, mobileMenu } from './shell-state';
import { shellStyles } from './shell-styles';
import { UpdateBanner } from './update-banner';

type Me = components['schemas']['Me'];

export function ShellScreen({
  me,
  area,
  activeBusinessId,
}: {
  readonly me: Me;
  readonly area: MobileArea;
  readonly activeBusinessId: string | undefined;
}) {
  const { t } = useTranslation();
  const logout = useLogout();
  const items = mobileMenu(me, area);
  return (
    <ScrollView contentContainerStyle={shellStyles.screen} testID={`shell-${area}`}>
      <UpdateBanner />
      <BusinessSelector memberships={me.memberships ?? []} activeBusinessId={activeBusinessId} />
      <Text style={shellStyles.title}>{t('shell.menu.dashboard')}</Text>
      <Text>{t('shell.dashboard_soon')}</Text>
      <View accessibilityLabel={t('shell.menu_label')}>
        {items
          .filter((item) => item.key !== 'dashboard')
          .map((item) => (
            <View
              key={item.key}
              style={[shellStyles.item, !item.ready && shellStyles.disabled]}
              testID={`menu-${item.key}`}
            >
              <Text>{t(`shell.menu.${item.key}`)}</Text>
            </View>
          ))}
      </View>
      <LanguagePicker />
      <Pressable
        style={shellStyles.button}
        accessibilityRole="button"
        disabled={logout.isPending}
        onPress={() => {
          logout.mutate();
        }}
      >
        <Text>{t('common.logout')}</Text>
      </Pressable>
    </ScrollView>
  );
}

/** İşletme yok veya yalnız platform rolü: bilgi + dil + çıkış. */
export function NoAreaScreen({ messageKey }: { readonly messageKey: string }) {
  const { t } = useTranslation();
  const logout = useLogout();
  return (
    <View style={shellStyles.center}>
      <UpdateBanner />
      <Text>{t(messageKey)}</Text>
      <LanguagePicker />
      <Pressable
        style={shellStyles.button}
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
