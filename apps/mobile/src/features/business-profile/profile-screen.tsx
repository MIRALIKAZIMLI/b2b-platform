// İşletme profili ve VÖEN (F2.4, US-006 AC1–AC3). Web ile aynı form mantığı (`@b2b/shared`).
// UX kararları: tek sütun, iki kart (VÖEN üstte, durum rozetiyle; işletme bilgileri altta).
// VÖEN alanı sayı klavyesiyle; yazarken hukuki tip Indigo ipucu. Bölge alttan açılan aramalı
// listeyle. Ana eylem en altta tam genişlik Indigo düğme; basılı durumda ölçek geri bildirimi.
// Hata alanın altında; AC3 mesajı VÖEN alanında. Başarı Emerald satırı. Yükleniyor = gösterge,
// hata = yeniden dene kartı. Kişisel veri ve logo F2.10.
import {
  type ProfileFieldErrors,
  type ProfileFormField,
  type ProfileFormValues,
  legalTypeHint,
  profileFailure,
  profileFormValues,
  validateProfile,
  voenStatus,
  type VoenStatus,
} from '@b2b/shared';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, pressed, radius, softShadow, space, touchTarget } from '../../lib/theme';
import { OptionField } from '../registration/option-sheet';
import { canManageBusiness } from '../registration/options';
import { useBusinessProfile, useRegionOptions } from '../registration/queries';
import { useShell } from '../shell/use-shell';
import { ProfileSaveError, useUpdateBusinessProfile } from './queries';

const BADGE: Record<VoenStatus, { bg: string; fg: string }> = {
  missing: { bg: colors.surfaceMuted, fg: colors.textMuted },
  pending: { bg: colors.accentSoft, fg: colors.accent },
  verified: { bg: '#ecfdf5', fg: '#047857' }, // emerald-50 / emerald-700
};

export function BusinessProfileScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const shell = useShell();
  const businessId = shell.activeBusinessId;
  const canManage = shell.me === undefined ? false : canManageBusiness(shell.me);
  const profile = useBusinessProfile(businessId, canManage);
  const regions = useRegionOptions(i18n.language);
  const update = useUpdateBusinessProfile(businessId);
  const [initial, setInitial] = useState<ProfileFormValues>(() => profileFormValues(undefined));
  const [values, setValues] = useState<ProfileFormValues>(initial);
  const [errors, setErrors] = useState<ProfileFieldErrors>({});
  const [general, setGeneral] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (profile.data === undefined) return;
    const next = profileFormValues(profile.data);
    setInitial(next);
    setValues(next);
  }, [profile.data]);

  const set = (field: ProfileFormField, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
    setErrors((prev) => (prev[field] === undefined ? prev : { ...prev, [field]: undefined }));
  };

  function save() {
    setGeneral(undefined);
    setSaved(false);
    const result = validateProfile(values, initial);
    if (!result.ok) {
      setErrors(result.fields);
      return;
    }
    setErrors({});
    if (Object.keys(result.body).length === 0) {
      setSaved(true);
      return;
    }
    update.mutate(result.body, {
      onSuccess: () => {
        setSaved(true);
      },
      onError: (error) => {
        const failure = profileFailure(error instanceof ProfileSaveError ? error.body : undefined);
        if (failure.kind === 'fields') setErrors(failure.fields);
        else setGeneral(failure.code);
      },
    });
  }

  const errorText = (field: ProfileFormField) => {
    const reason = errors[field];
    return reason === undefined ? undefined : t(`businessProfile.error.${reason}`);
  };

  const input = (
    field: Exclude<ProfileFormField, 'regionId'>,
    props: TextInputProps = {},
    hint?: string,
  ) => (
    <View style={styles.field}>
      <Text style={styles.label}>{t(`businessProfile.field.${field}`)}</Text>
      <TextInput
        value={values[field]}
        onChangeText={(value) => {
          set(field, value);
        }}
        editable={profile.data !== undefined}
        accessibilityLabel={t(`businessProfile.field.${field}`)}
        style={[styles.input, errors[field] !== undefined && styles.inputInvalid]}
        placeholderTextColor={colors.textSubtle}
        testID={`profile-${field}`}
        {...props}
      />
      {errors[field] !== undefined ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {errorText(field)}
        </Text>
      ) : (
        hint !== undefined && <Text style={styles.hint}>{hint}</Text>
      )}
    </View>
  );

  const back = (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        router.back();
      }}
      style={({ pressed: isPressed }) => [styles.back, isPressed && pressed]}
    >
      <Text style={styles.backText}>← {t('businessProfile.back')}</Text>
    </Pressable>
  );

  if (profile.isError) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <View style={styles.card}>
            <Text accessibilityRole="alert" style={styles.body}>
              {t('businessProfile.load_failed')}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void profile.refetch()}
              style={({ pressed: isPressed }) => [styles.secondary, isPressed && pressed]}
            >
              <Text style={styles.secondaryText}>{t('businessProfile.retry')}</Text>
            </Pressable>
          </View>
          {back}
        </View>
      </SafeAreaView>
    );
  }
  if (profile.data === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const status = voenStatus(profile.data);
  const legalType = legalTypeHint(values.voen);
  const voenChanged = initial.voen !== '' && values.voen !== initial.voen;
  const badge = BADGE[status];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.safe}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {back}
          <View style={styles.header}>
            <Text style={styles.title} accessibilityRole="header">
              {t('businessProfile.title')}
            </Text>
            <Text style={styles.body}>{t('businessProfile.description')}</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.section}>{t('businessProfile.section.voen')}</Text>
              <View style={[styles.badge, { backgroundColor: badge.bg }]} testID="voen-status">
                <Text style={[styles.badgeText, { color: badge.fg }]}>
                  {t(`businessProfile.status.${status}`)}
                </Text>
              </View>
            </View>
            {status === 'missing' && (
              <Text style={styles.body}>{t('businessProfile.voen_needed')}</Text>
            )}
            {input(
              'voen',
              { keyboardType: 'number-pad', maxLength: 10, autoCorrect: false },
              voenChanged
                ? t('businessProfile.voen_change_warning')
                : t('businessProfile.voen_hint'),
            )}
            {legalType !== undefined && errors.voen === undefined && (
              <Text style={styles.legalType} testID="voen-legal-type">
                {t(`businessProfile.legal_type.${legalType}`)}
              </Text>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.section}>{t('businessProfile.section.business')}</Text>
            {input('legalName', { autoComplete: 'organization' })}
            <OptionField
              label={t('businessProfile.field.regionId')}
              value={values.regionId}
              options={regions.data ?? []}
              error={errorText('regionId')}
              onChange={(id) => {
                set('regionId', id);
              }}
              testID="profile-regionId"
            />
            {input('businessPhone', { keyboardType: 'phone-pad', autoComplete: 'tel' })}
            {input('addressLine', { autoComplete: 'street-address' })}
          </View>

          {general !== undefined && (
            <Text accessibilityRole="alert" style={styles.generalError}>
              {t(`errors.${general}`)}
            </Text>
          )}
          {saved && (
            <Text accessibilityLiveRegion="polite" style={styles.saved}>
              ✓ {t('businessProfile.saved')}
            </Text>
          )}
          <Pressable
            accessibilityRole="button"
            disabled={update.isPending}
            onPress={save}
            testID="profile-save"
            style={({ pressed: isPressed }) => [
              styles.primary,
              update.isPending && styles.disabled,
              isPressed && pressed,
            ]}
          >
            {update.isPending ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={styles.primaryText}>{t('businessProfile.save')}</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', padding: space.xl, gap: space.lg },
  scroll: { padding: space.xl, gap: space.lg, paddingBottom: space.xxl * 2 },
  back: { alignSelf: 'flex-start', minHeight: touchTarget, justifyContent: 'center' },
  backText: { fontSize: 15, fontWeight: '600', color: colors.accent },
  header: { gap: space.sm },
  title: { fontSize: 26, fontWeight: '700', color: colors.text },
  body: { fontSize: 14, lineHeight: 20, color: colors.textMuted },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.xl,
    gap: space.lg,
    ...softShadow(1),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  section: { fontSize: 13, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.5 },
  badge: { borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.xs },
  badgeText: { fontSize: 12, fontWeight: '700' },
  field: { gap: space.sm },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  input: {
    minHeight: touchTarget + 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    paddingHorizontal: space.lg,
    fontSize: 16,
    color: colors.text,
  },
  inputInvalid: { borderColor: colors.danger },
  hint: { fontSize: 13, color: colors.textMuted },
  legalType: { fontSize: 13, fontWeight: '700', color: colors.accent },
  error: { fontSize: 13, fontWeight: '500', color: colors.danger },
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
