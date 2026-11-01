// Perakendeci açılış kartları (US-005 AC2; F2.3b): "Profilinizi tamamlayın" doluluk yüzdesiyle
// (yalnız `business.manage` izniyle ve %100 değilken) ve toptancı/ürün olmadığını anlatan boş durum.
// UX: Indigo zeminli yumuşak kart, kalın yüzde, ince ilerleme çubuğu; boş durum sakin, kesik kenarlı.
import type { components } from '@b2b/api-client';
import { clampPercent } from '@b2b/shared';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, softShadow, space } from '../../lib/theme';
import { canManageBusiness } from './options';
import { useBusinessProfile } from './queries';

type Me = components['schemas']['Me'];

export function ProfileCompletionCard({ percent }: { readonly percent: number }) {
  const { t, i18n } = useTranslation();
  const value = clampPercent(percent);
  const label = new Intl.NumberFormat(i18n.language, { style: 'percent' }).format(value / 100);
  return (
    <View style={styles.profile} testID="profile-completion">
      <View style={styles.profileHeader}>
        <View style={styles.profileText}>
          <Text style={styles.title} accessibilityRole="header">
            {t('profile.complete_title')}
          </Text>
          <Text style={styles.body}>{t('profile.complete_body')}</Text>
        </View>
        <Text style={styles.percent}>{label}</Text>
      </View>
      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityLabel={t('profile.complete_percent', { percent: value })}
        accessibilityValue={{ min: 0, max: 100, now: value }}
      >
        <View style={[styles.fill, { width: `${String(value)}%` }]} />
      </View>
    </View>
  );
}

export function BuyerHomeCards({
  me,
  activeBusinessId,
}: {
  readonly me: Me;
  readonly activeBusinessId: string | undefined;
}) {
  const { t } = useTranslation();
  const profile = useBusinessProfile(activeBusinessId, canManageBusiness(me));
  const percent = profile.data?.profileCompleteness;
  return (
    <View style={styles.stack}>
      {percent !== undefined && percent < 100 && <ProfileCompletionCard percent={percent} />}
      <View style={styles.empty}>
        <Text style={styles.title}>{t('buyer.home.empty_title')}</Text>
        <Text style={styles.body}>{t('buyer.home.empty_body')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.lg },
  profile: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(199, 210, 254, 0.8)', // indigo-200/80
    padding: space.xl,
    gap: space.lg,
    ...softShadow(1),
  },
  profileHeader: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  profileText: { flex: 1, gap: space.xs },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  body: { fontSize: 14, lineHeight: 20, color: colors.textMuted },
  percent: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.accent,
    fontVariant: ['tabular-nums'],
  },
  track: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(148, 163, 184, 0.25)',
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.accent },
  empty: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    padding: space.xl,
    gap: space.sm,
    alignItems: 'center',
  },
});
