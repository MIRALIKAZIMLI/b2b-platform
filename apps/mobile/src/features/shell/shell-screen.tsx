// Alan açılış sayfası (dashboard yer tutucusu) + izinden menü + işletme seçici + dil + çıkış.
// Menü yalnızca görünümdür; asıl yetki kontrolü API'dedir. Mobil ekranı olmayan öğe bağlantısız.
import type { components } from '@b2b/api-client';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useLogout } from '../../lib/session';
import { LanguagePicker } from '../language/language-picker';
import { BuyerHomeCards } from '../registration/buyer-home-cards';
import { BusinessSelector } from './business-selector';
import { type MobileArea, mobileHref, mobileMenu } from './shell-state';
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
  const router = useRouter();
  const logout = useLogout();
  const items = mobileMenu(me, area);
  return (
    <ScrollView contentContainerStyle={shellStyles.screen} testID={`shell-${area}`}>
      <UpdateBanner />
      <BusinessSelector memberships={me.memberships ?? []} activeBusinessId={activeBusinessId} />
      <Text style={shellStyles.title}>{t('shell.menu.dashboard')}</Text>
      {/* F2.3b: perakendecide profil doluluk kartı ve boş durum (US-005 AC2). */}
      {area === 'buyer' ? (
        <BuyerHomeCards me={me} activeBusinessId={activeBusinessId} />
      ) : (
        <Text>{t('shell.dashboard_soon')}</Text>
      )}
      <View accessibilityLabel={t('shell.menu_label')}>
        {items
          .filter((item) => item.key !== 'dashboard')
          .map((item) => {
            const href = mobileHref(area, item);
            return (
              <Pressable
                key={item.key}
                accessibilityRole={href === undefined ? 'text' : 'link'}
                disabled={href === undefined}
                onPress={() => {
                  if (href !== undefined) router.push(href);
                }}
                style={({ pressed }) => [
                  shellStyles.item,
                  href === undefined && shellStyles.disabled,
                  pressed && { opacity: 0.7 },
                ]}
                testID={`menu-${item.key}`}
              >
                <Text>{t(`shell.menu.${item.key}`)}</Text>
              </Pressable>
            );
          })}
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
