// Şubeler — mobil (F2.5b, US-010). UX kararları:
// - Liste görünümü: başlık, tek ana eylem "Yeni filial" (tam genişlik Indigo düğme), her şube bir
//   kart (ad, kural rozeti, pasif rozeti, bölge · adres, konum). Kartta iki ikincil düğme:
//   düzenle, pasifleştir / etkinleştir. Silme yok (AC4).
// - Form görünümü (yeni / düzenle aynı): alanlar dikey, onay kuralı üç dokunmatik kart, eşik yalnız
//   `above_amount`'ta; konum için "Yerimi istifadə et" (expo-location, izin istenir; Mimar kararı S2)
//   veya elle enlem/boylam. Klavye açıkken form kaydırılır.
// - 409 nedenleri (son aktif şube; çalışan / açık davet, S3) açıklayıcı mesajla; aşağı çekince yenilenir.
import {
  BRANCH_APPROVAL_RULES,
  branchFailure,
  type BranchErrors,
  type BranchFormValues,
  branchFormValues,
  EMPTY_BRANCH_FORM,
  formatCoordinate,
  validateBranch,
} from '@b2b/shared';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
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
import { type Branch, BranchSaveError, useBranches, useBranchMutations } from './queries';

type Mode =
  { kind: 'list' } | { kind: 'new' } | { kind: 'edit'; id: string; initial: BranchFormValues };
type LocateState = 'idle' | 'locating' | 'denied' | 'unavailable';

export function BranchesScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const shell = useShell();
  const allowed =
    shell.me !== undefined &&
    shell.me.activeBusiness?.capability === 'buyer' &&
    canManageBusiness(shell.me);
  const businessId = allowed ? shell.activeBusinessId : undefined;
  const list = useBranches(businessId);
  const regions = useRegionOptions(i18n.language);
  const business = useBusinessProfile(businessId, allowed);
  const { create, update } = useBranchMutations(businessId);
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [values, setValues] = useState<BranchFormValues>(EMPTY_BRANCH_FORM);
  const [errors, setErrors] = useState<BranchErrors>({});
  const [message, setMessage] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);
  const [locate, setLocate] = useState<LocateState>('idle');
  const currency = business.data?.currency;

  const regionLabel = useMemo(() => {
    const map = new Map((regions.data ?? []).map((item) => [item.id, item.label]));
    return (id: string | null) => (id === null ? undefined : map.get(id));
  }, [regions.data]);

  const begin = () => {
    setMessage(undefined);
    setSaved(false);
  };
  const failure = (error: unknown) => {
    const body = error instanceof BranchSaveError ? (error.body as { code?: string }) : undefined;
    const result = branchFailure(body);
    if (result.kind === 'last_active') setMessage(t('branches.error.last_active'));
    else if (result.kind === 'in_use') {
      setMessage(
        t('branches.error.in_use', { members: result.members, invitations: result.invitations }),
      );
    } else setMessage(t(`errors.${result.code}`));
  };
  const open = (next: Mode, form: BranchFormValues) => {
    begin();
    setErrors({});
    setLocate('idle');
    setValues(form);
    setMode(next);
  };
  const set = (patch: Partial<BranchFormValues>) => {
    setValues((current) => ({ ...current, ...patch }));
    setErrors({});
  };

  async function locateMe() {
    setLocate('locating');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        setLocate('denied');
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      set({
        lat: formatCoordinate(position.coords.latitude),
        lng: formatCoordinate(position.coords.longitude),
      });
      setLocate('idle');
    } catch (error: unknown) {
      // Konum servisi kapalı / zaman aşımı: elle girişe yönlendir (hata metni loglanmaz).
      setLocate(
        error instanceof Error && error.message.includes('denied') ? 'denied' : 'unavailable',
      );
    }
  }

  function submit() {
    begin();
    const result = validateBranch(values, mode.kind === 'edit' ? mode.initial : undefined);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    const done = {
      onSuccess: () => {
        setMode({ kind: 'list' });
        setSaved(true);
      },
      onError: failure,
    };
    if (mode.kind === 'edit') {
      if (Object.keys(result.body).length === 0) {
        setMode({ kind: 'list' });
        return;
      }
      update.mutate({ id: mode.id, body: result.body }, done);
    } else {
      create.mutate(result.body, done);
    }
  }

  function toggle(branch: Branch) {
    begin();
    update.mutate(
      { id: branch.id, body: { status: branch.status === 'active' ? 'inactive' : 'active' } },
      {
        onSuccess: () => {
          setSaved(true);
        },
        onError: failure,
      },
    );
  }

  const busy = create.isPending || update.isPending;
  const errorText = (field: keyof BranchFormValues) => {
    const reason = errors[field];
    return reason === undefined ? undefined : t(`branches.error.${reason}`);
  };
  const input = (
    field: 'name' | 'addressLine' | 'approvalThreshold' | 'lat' | 'lng',
    label: string,
    props: TextInputProps = {},
  ) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={values[field]}
        onChangeText={(value) => {
          set({ [field]: value });
        }}
        accessibilityLabel={label}
        style={[styles.input, errors[field] !== undefined && styles.inputInvalid]}
        placeholderTextColor={colors.textSubtle}
        testID={`branch-${field}`}
        {...props}
      />
      {errorText(field) !== undefined && (
        <Text style={styles.error} accessibilityRole="alert">
          {errorText(field)}
        </Text>
      )}
    </View>
  );

  const status =
    message !== undefined ? (
      <Text style={styles.generalError} accessibilityRole="alert">
        {message}
      </Text>
    ) : saved ? (
      <Text style={styles.saved} accessibilityRole="text">
        ✓ {t('branches.saved')}
      </Text>
    ) : null;

  const back = (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        if (mode.kind === 'list') router.back();
        else open({ kind: 'list' }, EMPTY_BRANCH_FORM);
      }}
      style={({ pressed: isPressed }) => [styles.back, isPressed && pressed]}
    >
      <Text style={styles.backText}>
        ← {mode.kind === 'list' ? t('connections.mobile.back') : t('branches.cancel')}
      </Text>
    </Pressable>
  );

  if (shell.me !== undefined && !allowed) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll}>
          {back}
          <Text style={styles.title} accessibilityRole="header">
            {t('branches.title')}
          </Text>
          <View style={styles.card}>
            <Text style={styles.meta}>{t('branches.not_allowed')}</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (mode.kind !== 'list') {
    return (
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            {back}
            <Text style={styles.title} accessibilityRole="header">
              {mode.kind === 'new' ? t('branches.new_title') : t('branches.edit')}
            </Text>
            <Text style={styles.meta}>{t('branches.new_hint')}</Text>
            <View style={styles.card}>
              {input('name', t('branches.field.name'), { autoCapitalize: 'words' })}
              <OptionField
                label={t('branches.field.region')}
                value={values.regionId}
                options={regions.data ?? []}
                error={errorText('regionId')}
                onChange={(id) => {
                  set({ regionId: id });
                }}
                testID="branch-regionId"
              />
              {input('addressLine', t('branches.field.address'), {
                autoComplete: 'street-address',
              })}
            </View>

            <View style={styles.card}>
              <Text style={styles.label}>{t('branches.field.rule')}</Text>
              <View accessibilityRole="radiogroup" style={styles.rules}>
                {BRANCH_APPROVAL_RULES.map((rule) => {
                  const selected = values.approvalRule === rule;
                  return (
                    <Pressable
                      key={rule}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      onPress={() => {
                        set({ approvalRule: rule });
                      }}
                      style={({ pressed: isPressed }) => [
                        styles.rule,
                        selected && styles.ruleActive,
                        isPressed && pressed,
                      ]}
                      testID={`branch-rule-${rule}`}
                    >
                      <Text style={[styles.ruleTitle, selected && styles.ruleTitleActive]}>
                        {t(`branches.rule.${rule}.title`)}
                      </Text>
                      <Text style={styles.ruleHint}>{t(`branches.rule.${rule}.hint`)}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {values.approvalRule === 'above_amount' && (
                <>
                  {input(
                    'approvalThreshold',
                    currency === undefined
                      ? t('branches.field.threshold')
                      : `${t('branches.field.threshold')} (${currency})`,
                    { keyboardType: 'decimal-pad' },
                  )}
                  <Text style={styles.hint}>{t('branches.threshold_hint')}</Text>
                </>
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.label}>
                {t('branches.field.location')}{' '}
                <Text style={styles.hint}>{t('branches.optional')}</Text>
              </Text>
              <Pressable
                accessibilityRole="button"
                disabled={locate === 'locating'}
                onPress={() => void locateMe()}
                style={({ pressed: isPressed }) => [styles.secondary, isPressed && pressed]}
                testID="branch-locate"
              >
                <Text style={styles.secondaryText}>
                  {locate === 'locating' ? t('branches.locating') : t('branches.use_my_location')}
                </Text>
              </Pressable>
              <View style={styles.pair}>
                <View style={styles.flex}>
                  {input('lat', t('branches.field.lat'), {
                    keyboardType: 'numbers-and-punctuation',
                  })}
                </View>
                <View style={styles.flex}>
                  {input('lng', t('branches.field.lng'), {
                    keyboardType: 'numbers-and-punctuation',
                  })}
                </View>
              </View>
              <Text style={styles.hint} accessibilityRole={locate === 'idle' ? 'text' : 'alert'}>
                {locate === 'denied'
                  ? t('branches.location_denied')
                  : locate === 'unavailable'
                    ? t('branches.location_unavailable')
                    : t('branches.location_hint')}
              </Text>
            </View>

            {status}
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={submit}
              style={({ pressed: isPressed }) => [
                styles.primary,
                busy && styles.disabled,
                isPressed && pressed,
              ]}
              testID="branch-submit"
            >
              {busy ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={styles.primaryText}>
                  {mode.kind === 'new' ? t('branches.add') : t('branches.save')}
                </Text>
              )}
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  const branches = list.data ?? [];
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />
        }
      >
        {back}
        <Text style={styles.title} accessibilityRole="header">
          {t('branches.title')}
        </Text>
        <Text style={styles.meta}>{t('branches.description')}</Text>
        <Pressable
          accessibilityRole="button"
          disabled={list.data === undefined}
          onPress={() => {
            open({ kind: 'new' }, EMPTY_BRANCH_FORM);
          }}
          style={({ pressed: isPressed }) => [
            styles.primary,
            list.data === undefined && styles.disabled,
            isPressed && pressed,
          ]}
          testID="branch-new"
        >
          <Text style={styles.primaryText}>{t('branches.new')}</Text>
        </Pressable>
        {status}
        {list.isError ? (
          <View style={[styles.card, styles.errorCard]} accessibilityRole="alert">
            <Text style={styles.error}>{t('branches.load_failed')}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void list.refetch()}
              style={({ pressed: isPressed }) => [styles.secondary, isPressed && pressed]}
            >
              <Text style={styles.secondaryText}>{t('branches.retry')}</Text>
            </Pressable>
          </View>
        ) : list.data === undefined ? (
          <ActivityIndicator style={styles.loader} color={colors.accent} />
        ) : branches.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.name}>{t('branches.empty')}</Text>
            <Text style={styles.meta}>{t('branches.empty_hint')}</Text>
          </View>
        ) : (
          branches.map((branch) => {
            const inactive = branch.status === 'inactive';
            const place = [regionLabel(branch.regionId), branch.addressLine]
              .filter((part) => part !== undefined && part !== null && part !== '')
              .join(' · ');
            return (
              <View
                key={branch.id}
                style={[styles.card, inactive && styles.inactive]}
                testID="branch-card"
              >
                <View style={styles.cardHead}>
                  <Text style={[styles.flex, styles.name]} numberOfLines={2}>
                    {branch.name}
                  </Text>
                  {inactive && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{t('branches.inactive')}</Text>
                    </View>
                  )}
                </View>
                <View style={[styles.badge, styles.ruleBadge]}>
                  <Text style={[styles.badgeText, styles.ruleBadgeText]}>
                    {branch.approvalRule === 'above_amount' && branch.approvalThreshold !== null
                      ? t('branches.rule_badge.above_amount', {
                          amount: branch.approvalThreshold,
                          currency: currency ?? '',
                        })
                      : t(`branches.rule_badge.${branch.approvalRule}`)}
                  </Text>
                </View>
                <Text style={styles.meta} numberOfLines={2}>
                  {place === '' ? t('branches.no_address') : place}
                </Text>
                <Text style={styles.coords}>
                  {branch.lat !== null && branch.lng !== null
                    ? `${String(branch.lat)}, ${String(branch.lng)}`
                    : t('branches.no_location')}
                </Text>
                <View style={styles.actions}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => {
                      const form = branchFormValues(branch);
                      open({ kind: 'edit', id: branch.id, initial: form }, form);
                    }}
                    style={({ pressed: isPressed }) => [
                      styles.secondary,
                      styles.flex,
                      isPressed && pressed,
                    ]}
                  >
                    <Text style={styles.secondaryText}>{t('branches.edit')}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => {
                      toggle(branch);
                    }}
                    style={({ pressed: isPressed }) => [
                      styles.secondary,
                      styles.flex,
                      isPressed && pressed,
                    ]}
                  >
                    <Text style={[styles.secondaryText, !inactive && styles.dangerText]}>
                      {inactive ? t('branches.activate') : t('branches.deactivate')}
                    </Text>
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
        <Text style={styles.hint}>{t('branches.no_delete_note')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scroll: { padding: space.xl, gap: space.lg, paddingBottom: space.xxl * 2 },
  back: { alignSelf: 'flex-start', minHeight: touchTarget, justifyContent: 'center' },
  backText: { fontSize: 15, fontWeight: '600', color: colors.accent },
  title: { fontSize: 26, fontWeight: '700', color: colors.text },
  meta: { fontSize: 14, lineHeight: 20, color: colors.textMuted },
  coords: { fontSize: 12, color: colors.textSubtle, fontVariant: ['tabular-nums'] },
  hint: { fontSize: 13, lineHeight: 18, color: colors.textMuted, fontWeight: '400' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.xl,
    gap: space.md,
    ...softShadow(1),
  },
  inactive: { opacity: 0.7 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  name: { fontSize: 17, fontWeight: '600', color: colors.text },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    backgroundColor: colors.surfaceMuted,
  },
  badgeText: { fontSize: 12, fontWeight: '600', color: '#475569' }, // slate-600
  ruleBadge: { backgroundColor: '#fffbeb' }, // amber-50
  ruleBadgeText: { color: '#b45309' }, // amber-700
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.xs },
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
  errorCard: { backgroundColor: colors.dangerSoft },
  generalError: {
    fontSize: 14,
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.lg,
    padding: space.lg,
    overflow: 'hidden',
  },
  saved: { fontSize: 14, fontWeight: '600', color: colors.success },
  rules: { gap: space.sm },
  rule: {
    minHeight: touchTarget + 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: space.lg,
    gap: 2,
  },
  ruleActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  ruleTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  ruleTitleActive: { color: colors.accent },
  ruleHint: { fontSize: 13, color: colors.textMuted },
  pair: { flexDirection: 'row', gap: space.md },
  loader: { marginTop: space.xl },
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
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  secondaryText: { fontSize: 15, fontWeight: '600', color: colors.text },
  dangerText: { color: colors.danger },
});
