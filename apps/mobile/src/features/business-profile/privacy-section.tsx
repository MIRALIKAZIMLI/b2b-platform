// Görünürlük ayarları (F2.10, US-007 AC1–AC3, ADR-0014). Web ile aynı liste (`@b2b/shared`).
// UX kararları: profil kaydının altında ayrı kart ve ayrı tam genişlik "Kaydet". Üstte vurgulu
// "Dizinde görün" satırı; altında kilitli "Her zaman görünür" satırları (anahtar yok, AC3) ve tek
// tek açılan alanlar. Satırın tamamı dokunulabilir (≥44 pt), basılıyken ölçek geri bildirimi;
// anahtar açıkken Indigo. Kaydet yalnız değişiklik varken etkin. Başarı Emerald satırı.
import {
  ALWAYS_VISIBLE_FIELDS,
  changedPrivacyKeys,
  DEFAULT_PRIVACY,
  PRIVACY_FIELD_KEYS,
  type PrivacyKey,
  type PrivacySettings,
} from '@b2b/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { colors, pressed, radius, softShadow, space, touchTarget } from '../../lib/theme';
import { ProfileSaveError, usePrivacySettings, useUpdatePrivacy } from './queries';

function errorCode(error: unknown): string {
  if (error instanceof ProfileSaveError) {
    const body = error.body;
    if (typeof body === 'object' && body !== null && 'code' in body) {
      const code = body.code;
      if (typeof code === 'string') return code;
    }
  }
  return 'INTERNAL_ERROR';
}

function ToggleRow({
  testID,
  label,
  hint,
  value,
  disabled,
  onChange,
}: {
  testID: string;
  label: string;
  hint?: string | undefined;
  value: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      testID={testID}
      onPress={() => {
        onChange(!value);
      }}
      style={({ pressed: isPressed }) => [styles.toggleRow, isPressed && pressed]}
    >
      <View style={styles.toggleText}>
        <Text style={styles.label}>{label}</Text>
        {hint !== undefined && <Text style={styles.hint}>{hint}</Text>}
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ false: colors.surfaceMuted, true: colors.accent }}
        thumbColor={colors.surface}
        ios_backgroundColor={colors.surfaceMuted}
        importantForAccessibility="no-hide-descendants"
      />
    </Pressable>
  );
}

export function PrivacySection({
  businessId,
  enabled,
}: {
  businessId: string | undefined;
  enabled: boolean;
}) {
  const { t } = useTranslation();
  const settings = usePrivacySettings(businessId, enabled);
  const update = useUpdatePrivacy(businessId);
  const [values, setValues] = useState<PrivacySettings>(DEFAULT_PRIVACY);
  const [saved, setSaved] = useState(false);
  const [general, setGeneral] = useState<string | undefined>();

  useEffect(() => {
    if (settings.data !== undefined) setValues(settings.data);
  }, [settings.data]);

  if (settings.isError) {
    return (
      <View style={styles.card}>
        <Text accessibilityRole="alert" style={styles.body}>
          {t('businessPrivacy.load_failed')}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => void settings.refetch()}
          style={({ pressed: isPressed }) => [styles.secondary, isPressed && pressed]}
        >
          <Text style={styles.secondaryText}>{t('businessPrivacy.retry')}</Text>
        </Pressable>
      </View>
    );
  }

  const loading = settings.data === undefined;
  const dirty = settings.data !== undefined && changedPrivacyKeys(settings.data, values).length > 0;
  const set = (key: PrivacyKey, next: boolean) => {
    setValues((prev) => ({ ...prev, [key]: next }));
    setSaved(false);
    setGeneral(undefined);
  };

  function save() {
    setGeneral(undefined);
    update.mutate(values, {
      onSuccess: () => {
        setSaved(true);
      },
      onError: (error) => {
        setGeneral(errorCode(error));
      },
    });
  }

  return (
    <View style={styles.card} testID="privacy-section">
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          {t('businessPrivacy.title')}
        </Text>
        <Text style={styles.body}>{t('businessPrivacy.description')}</Text>
      </View>

      <View style={styles.highlight}>
        <ToggleRow
          testID="privacy-listedInDirectory"
          label={t('businessPrivacy.field.listedInDirectory')}
          hint={t(
            values.listedInDirectory
              ? 'businessPrivacy.listed_on_hint'
              : 'businessPrivacy.listed_off_hint',
          )}
          value={values.listedInDirectory}
          disabled={loading}
          onChange={(next) => {
            set('listedInDirectory', next);
          }}
        />
      </View>

      <Text style={styles.section}>{t('businessPrivacy.always_title')}</Text>
      <View style={styles.group}>
        {ALWAYS_VISIBLE_FIELDS.map((field, index) => (
          <View
            key={field}
            testID={`privacy-always-${field}`}
            style={[styles.lockedRow, index > 0 && styles.divider]}
          >
            <Text style={styles.label}>{t(`businessPrivacy.always.${field}`)}</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>🔒 {t('businessPrivacy.always_badge')}</Text>
            </View>
          </View>
        ))}
      </View>

      <Text style={styles.section}>{t('businessPrivacy.optional_title')}</Text>
      <View style={styles.group}>
        {PRIVACY_FIELD_KEYS.map((key, index) => (
          <View key={key} style={index > 0 ? styles.divider : undefined}>
            <ToggleRow
              testID={`privacy-${key}`}
              label={t(`businessPrivacy.field.${key}`)}
              hint={
                key === 'showPersonalContact'
                  ? t('businessPrivacy.personal_contact_hint')
                  : undefined
              }
              value={values[key]}
              disabled={loading}
              onChange={(next) => {
                set(key, next);
              }}
            />
          </View>
        ))}
      </View>

      {general !== undefined && (
        <Text accessibilityRole="alert" style={styles.generalError}>
          {t(`errors.${general}`)}
        </Text>
      )}
      {saved && !dirty && (
        <Text accessibilityLiveRegion="polite" style={styles.saved}>
          ✓ {t('businessPrivacy.saved')}
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: loading || update.isPending || !dirty }}
        disabled={loading || update.isPending || !dirty}
        onPress={save}
        testID="privacy-save"
        style={({ pressed: isPressed }) => [
          styles.primary,
          (loading || update.isPending || !dirty) && styles.disabled,
          isPressed && pressed,
        ]}
      >
        {update.isPending ? (
          <ActivityIndicator color={colors.onAccent} />
        ) : (
          <Text style={styles.primaryText}>{t('businessPrivacy.save')}</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.xl,
    gap: space.lg,
    ...softShadow(1),
  },
  header: { gap: space.xs },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  body: { fontSize: 14, lineHeight: 20, color: colors.textMuted },
  section: { fontSize: 13, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.5 },
  highlight: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: space.md,
  },
  group: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.md,
  },
  divider: { borderTopWidth: 1, borderTopColor: colors.surfaceMuted },
  toggleRow: {
    minHeight: touchTarget + 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingVertical: space.sm,
  },
  toggleText: { flex: 1, gap: 2 },
  lockedRow: {
    minHeight: touchTarget + 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  label: { fontSize: 15, fontWeight: '600', color: colors.text },
  hint: { fontSize: 13, color: colors.textMuted },
  badge: {
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  badgeText: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  generalError: {
    fontSize: 14,
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.lg,
    padding: space.lg,
    overflow: 'hidden',
  },
  saved: { fontSize: 14, fontWeight: '600', color: colors.success },
  primary: {
    minHeight: touchTarget + 8,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...softShadow(2),
  },
  primaryText: { color: colors.onAccent, fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.6 },
  secondary: {
    minHeight: touchTarget,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { fontSize: 15, fontWeight: '600', color: colors.text },
});
