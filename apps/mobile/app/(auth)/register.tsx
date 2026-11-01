// Perakendeci kaydı (F2.3b, US-005 AC1, AC3, AC4; NFR-63). SMS kodu kayıtsız bir numarayı
// doğruladığında açılır; kayıt anahtarı yalnız bellekte (`currentLogin`), yönlendirme parametresi
// veya depoda değil.
// UX kararları: tek sütun, iki kart (siz / işletme) ve onay paneli; klavye açıkken form kaydırılır,
// ana eylem en altta tam genişlik Indigo düğme. Seçimler alttan açılan aramalı listeyle (bölge
// listesi uzun). Metin onay panelinde yerinde açılır. Hata alanın altında; genel hata düğmenin
// üstünde. Sonuç durumları (numara kayıtlı, süre doldu, oturumsuz kayıt) formun yerine tek kart.
import {
  createIdempotencyKey,
  DATA_SHARING_ITEM_COUNT,
  DATA_SHARING_TEXT_VERSION,
  emptyRegistration,
  type RegistrationField,
  type RegistrationFieldErrors,
  type RegistrationValues,
  validateRegistration,
} from '@b2b/shared';
import { Redirect, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
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
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { currentLogin, resetLogin, useLoginFlow } from '../../src/features/auth/use-login';
import { OptionField } from '../../src/features/registration/option-sheet';
import { useActivityOptions, useRegionOptions } from '../../src/features/registration/queries';
import { mobileApi, useStartSession } from '../../src/lib/session';
import { useLanguageController } from '../../src/features/language/language-provider';
import { markProfileLanguageApplied } from '../../src/features/shell/use-shell';
import { colors, pressed, radius, softShadow, space, touchTarget } from '../../src/lib/theme';

type Notice = 'already' | 'expired' | 'done';
const ITEMS = Array.from({ length: DATA_SHARING_ITEM_COUNT }, (_, index) => index + 1);

export default function RegisterScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const flow = useLoginFlow();
  const startSession = useStartSession();
  const language = useLanguageController();
  const login = currentLogin();
  const regions = useRegionOptions(i18n.language);
  const activities = useActivityOptions(i18n.language);
  const [values, setValues] = useState<RegistrationValues>(emptyRegistration);
  const [errors, setErrors] = useState<RegistrationFieldErrors>({});
  const [general, setGeneral] = useState<string | undefined>();
  const [notice, setNotice] = useState<Notice | undefined>();
  const [showText, setShowText] = useState(false);
  const [busy, setBusy] = useState(false);
  // Aynı anahtar ağ hatasında korunur (tek işletme, R12/R13); sunucu kesin yanıt verince yenilenir.
  const idempotencyKey = useRef(createIdempotencyKey());

  if (login?.step.kind !== 'register' && notice === undefined) return <Redirect href="/phone" />;
  const pendingToken = login?.step.kind === 'register' ? login.step.pendingToken : '';
  const phone = login?.phone ?? '';

  const set = <K extends RegistrationField>(field: K, value: RegistrationValues[K]) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    // Düzeltilen alanın hatası hemen kalkar; diğerleri gönderene kadar kalır.
    setErrors((prev) => {
      if (prev[field] === undefined) return prev;
      return { ...prev, [field]: undefined };
    });
  };
  const errorText = (field: RegistrationField) => {
    const reason = errors[field];
    return reason === undefined ? undefined : t(`register.error.${reason}`);
  };

  async function submit() {
    const result = validateRegistration(values, i18n.language);
    if (!result.ok) {
      setErrors(result.fields);
      return;
    }
    setErrors({});
    const outcome = await flow.registerBuyer(pendingToken, result.body, idempotencyKey.current);
    if (outcome.kind === 'signed_in') {
      resetLogin();
      await startSession(outcome.tokens);
      const { data } = await mobileApi().client.GET('/api/v1/me');
      await language.applyProfile(data?.preferredLanguage);
      markProfileLanguageApplied(data?.id);
      router.replace('/');
      return;
    }
    if (outcome.kind === 'registered') {
      resetLogin();
      setNotice('done');
      return;
    }
    idempotencyKey.current = createIdempotencyKey();
    const { failure } = outcome;
    if (failure.kind === 'already_registered' || failure.kind === 'expired') {
      resetLogin();
      setNotice(failure.kind === 'expired' ? 'expired' : 'already');
    } else if (failure.kind === 'fields') setErrors(failure.fields);
    else setGeneral(failure.code);
  }

  function onSubmit() {
    setGeneral(undefined);
    setBusy(true);
    submit()
      .catch(() => {
        setGeneral('INTERNAL_ERROR');
      })
      .finally(() => {
        setBusy(false);
      });
  }

  if (notice !== undefined) {
    const copy = {
      already: { title: t('register.already_title'), body: t('register.already_body') },
      done: { title: t('register.done_title'), body: t('register.done_body') },
      expired: { title: t('register.expired'), body: undefined },
    }[notice];
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center} testID={`register-notice-${notice}`}>
          <View style={[styles.card, styles.noticeCard]}>
            <View style={[styles.badge, notice === 'done' && styles.badgeSuccess]}>
              <Text style={styles.badgeText}>{notice === 'done' ? '✓' : 'i'}</Text>
            </View>
            <Text style={styles.title} accessibilityRole="header">
              {copy.title}
            </Text>
            {copy.body !== undefined && <Text style={styles.subtitle}>{copy.body}</Text>}
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                router.replace('/phone');
              }}
              style={({ pressed: isPressed }) => [styles.primary, isPressed && pressed]}
            >
              <Text style={styles.primaryText}>
                {notice === 'expired' ? t('register.restart') : t('register.go_login')}
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const input = (field: 'fullName' | 'legalName', autoComplete: 'name' | 'off') => (
    <View style={styles.field}>
      <Text style={styles.label}>{t(`register.field.${field}`)}</Text>
      <TextInput
        value={values[field]}
        onChangeText={(text) => {
          set(field, text);
        }}
        autoComplete={autoComplete}
        textContentType={field === 'fullName' ? 'name' : 'organizationName'}
        accessibilityLabel={t(`register.field.${field}`)}
        testID={`register-${field}`}
        style={[styles.input, errors[field] !== undefined && styles.inputInvalid]}
        placeholderTextColor={colors.textSubtle}
      />
      {errors[field] !== undefined && (
        <Text accessibilityRole="alert" style={styles.error}>
          {errorText(field)}
        </Text>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.safe}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          testID="register-screen"
        >
          <View style={styles.header}>
            <Text style={styles.eyebrow}>{t('register.eyebrow')}</Text>
            <Text style={styles.title} accessibilityRole="header">
              {t('register.form_title')}
            </Text>
            <View style={styles.verified}>
              <View style={styles.dot}>
                <Text style={styles.dotText}>✓</Text>
              </View>
              <Text style={styles.subtitle}>{t('register.form_subtitle', { phone })}</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.section}>{t('register.section_you')}</Text>
            {input('fullName', 'name')}
          </View>

          <View style={styles.card}>
            <Text style={styles.section}>{t('register.section_business')}</Text>
            {input('legalName', 'off')}
            <OptionField
              label={t('register.field.activityTypeId')}
              value={values.activityTypeId}
              options={activities.data ?? []}
              error={errorText('activityTypeId')}
              onChange={(id) => {
                set('activityTypeId', id);
              }}
              testID="register-activityTypeId"
            />
            <OptionField
              label={t('register.field.regionId')}
              value={values.regionId}
              options={regions.data ?? []}
              error={errorText('regionId')}
              onChange={(id) => {
                set('regionId', id);
              }}
              testID="register-regionId"
            />
            {(regions.isError || activities.isError) && (
              <Text accessibilityRole="alert" style={styles.error}>
                {t('errors.INTERNAL_ERROR')}
              </Text>
            )}
          </View>

          <View style={[styles.card, errors.consent !== undefined && styles.cardInvalid]}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: values.consent }}
              testID="register-consent"
              onPress={() => {
                set('consent', !values.consent);
              }}
              style={({ pressed: isPressed }) => [styles.consentRow, isPressed && styles.dim]}
            >
              <View style={[styles.checkbox, values.consent && styles.checkboxOn]}>
                {values.consent && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.consentText}>{t('dataSharing.v1.accept')}</Text>
            </Pressable>
            {errors.consent !== undefined && (
              <Text accessibilityRole="alert" style={styles.error}>
                {errorText('consent')}
              </Text>
            )}
            <View style={styles.consentFooter}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: showText }}
                onPress={() => {
                  setShowText((open) => !open);
                }}
                style={({ pressed: isPressed }) => [styles.link, isPressed && styles.dim]}
              >
                <Text style={styles.linkText}>
                  {showText ? t('register.consent_hide') : t('register.consent_read')}
                </Text>
              </Pressable>
              <Text style={styles.version}>
                {t('register.consent_version', { version: DATA_SHARING_TEXT_VERSION })}
              </Text>
            </View>
            {showText && (
              <View style={styles.legal}>
                <Text style={styles.legalTitle}>{t('dataSharing.v1.title')}</Text>
                {ITEMS.map((item) => (
                  <View key={item} style={styles.legalItem}>
                    <View style={styles.legalNumber}>
                      <Text style={styles.legalNumberText}>{item}</Text>
                    </View>
                    <Text style={styles.legalBody}>
                      <Text style={styles.legalItemTitle}>
                        {t(`dataSharing.v1.item${String(item)}_title`)}
                      </Text>{' '}
                      {t(`dataSharing.v1.item${String(item)}_body`)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {general !== undefined && (
            <Text accessibilityRole="alert" style={styles.generalError}>
              {t(`errors.${general}`)}
            </Text>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy, busy }}
            disabled={busy}
            testID="register-submit"
            onPress={onSubmit}
            style={({ pressed: isPressed }) => [
              styles.primary,
              busy && styles.dim,
              isPressed && pressed,
            ]}
          >
            {busy ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={styles.primaryText}>{t('register.submit')}</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', padding: space.xl },
  scroll: { padding: space.xl, gap: space.lg, paddingBottom: space.xxl * 2 },
  header: { gap: space.sm, paddingVertical: space.md },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.accent,
  },
  title: { fontSize: 26, fontWeight: '700', color: colors.text },
  subtitle: { flexShrink: 1, fontSize: 15, color: colors.textMuted, lineHeight: 21 },
  verified: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dot: {
    width: 18,
    height: 18,
    borderRadius: radius.pill,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotText: { color: colors.onAccent, fontSize: 11, fontWeight: '700' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.xl,
    gap: space.lg,
    ...softShadow(1),
  },
  cardInvalid: { borderColor: colors.danger },
  noticeCard: { alignItems: 'center' },
  section: { fontSize: 13, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.5 },
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
  error: { fontSize: 13, fontWeight: '500', color: colors.danger },
  generalError: {
    fontSize: 14,
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.lg,
    padding: space.lg,
    overflow: 'hidden',
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    minHeight: touchTarget,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkmark: { color: colors.onAccent, fontSize: 14, fontWeight: '700' },
  consentText: { flex: 1, fontSize: 15, lineHeight: 21, color: colors.text },
  consentFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  link: { minHeight: touchTarget, justifyContent: 'center' },
  linkText: { fontSize: 15, fontWeight: '600', color: colors.accent },
  version: { fontSize: 12, color: colors.textSubtle, fontVariant: ['tabular-nums'] },
  legal: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
  },
  legalTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  legalItem: { flexDirection: 'row', gap: space.md },
  legalNumber: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legalNumberText: { fontSize: 11, fontWeight: '700', color: colors.accent },
  legalBody: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.textMuted },
  legalItemTitle: { fontWeight: '700', color: colors.text },
  primary: {
    minHeight: touchTarget + 8,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    alignSelf: 'stretch',
    ...softShadow(2),
  },
  primaryText: { color: colors.onAccent, fontSize: 16, fontWeight: '700' },
  dim: { opacity: 0.6 },
  badge: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...softShadow(2),
  },
  badgeSuccess: { backgroundColor: colors.success },
  badgeText: { color: colors.onAccent, fontSize: 22, fontWeight: '700' },
});
