// Perakendeci dizini — satış temsilcisi ekranı (F2.11b; US-019, US-020). UX kararları:
// - Üstte iki parçalı seçici: "Süzgəclə axtar" / "Telefon və ya VÖEN ilə tap" (saha kullanımı:
//   yeni kaydolanı numarayla anında bulmak tek dokunuş uzakta).
// - Filtre modu: arama kutusu + "Süzgəclər" düğmesi (alttan açılan sayfa: bölge, faaliyet,
//   doğrulanmış). Yazarken 300 ms bekler (hız sınırı). Liste sonuna gelince sonraki sayfa;
//   aşağı çekince yenilenir.
// - Tam eşleşme modu: tek kutu, telefon klavyesi; tanınmayan değerde istek gitmez, alan altında
//   ipucu. Sonuç aynı kart.
// - Kart: logo / baş harf, ünvan, doğrulanmış rozeti, bölge · faaliyet; yalnız açık alanlar.
//   Telefon satırına dokununca arama açılır (Linking, yeni paket yok).
// - Boş durumlar: bölge atanmamış, hizmet bölgesi yok, sonuç yok; 429'da kalan saniye.
import { parseExactLookup, pickLocalizedText } from '@b2b/shared';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { type TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, pressed, radius, softShadow, space, touchTarget } from '../../lib/theme';
import { OptionField } from '../registration/option-sheet';
import { useActivityOptions, useRegionOptions } from '../registration/queries';
import { useShell } from '../shell/use-shell';
import {
  type DirectoryBuyer,
  DirectoryError,
  type DirectoryFilters,
  EMPTY_FILTERS,
  useDirectorySearch,
  useExactLookup,
} from './queries';

type Mode = 'filter' | 'exact';

const FIELDS = [
  'businessPhone',
  'personalPhone',
  'email',
  'voen',
  'contactName',
  'addressLine',
] as const;
const PHONE_FIELDS: ReadonlySet<string> = new Set(['businessPhone', 'personalPhone']);

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((part) => part !== '')
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase())
    .join('');
}

function BuyerCard({ buyer }: { readonly buyer: DirectoryBuyer }) {
  const { t, i18n } = useTranslation();
  const open = FIELDS.filter((field) => buyer[field] !== null);
  return (
    <View style={styles.card} testID={`directory-buyer-${buyer.id}`}>
      <View style={styles.cardHead}>
        {buyer.logoUrl !== null ? (
          <Image
            source={{ uri: buyer.logoUrl }}
            style={styles.logo}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View style={[styles.logo, styles.logoFallback]}>
            <Text style={styles.logoText}>{initials(buyer.legalName)}</Text>
          </View>
        )}
        <View style={styles.flex}>
          <Text style={styles.name} numberOfLines={2}>
            {buyer.legalName}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {pickLocalizedText(buyer.region, i18n.language) ?? ''} ·{' '}
            {pickLocalizedText(buyer.activityType, i18n.language) ?? ''}
          </Text>
        </View>
        {buyer.verified && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{t('directory.verified')}</Text>
          </View>
        )}
      </View>
      {open.map((field) => {
        const value = buyer[field] ?? '';
        const phone = PHONE_FIELDS.has(field);
        return (
          <Pressable
            key={field}
            disabled={!phone}
            accessibilityRole={phone ? 'link' : 'text'}
            onPress={() => {
              void Linking.openURL(`tel:${value.replace(/[^+0-9]/g, '')}`);
            }}
            style={({ pressed: isPressed }) => [styles.row, phone && isPressed && pressed]}
          >
            <Text style={styles.rowLabel}>{t(`directory.field.${field}`)}</Text>
            <Text style={[styles.rowValue, phone && styles.link]} selectable>
              {value}
            </Text>
          </Pressable>
        );
      })}
      {(open.length < FIELDS.length || buyer.logoUrl === null) && (
        <Text style={styles.hidden}>{t('directory.hidden_fields')}</Text>
      )}
    </View>
  );
}

function Message({ title, body }: { readonly title: string; readonly body: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.name}>{title}</Text>
      <Text style={styles.meta}>{body}</Text>
    </View>
  );
}

function errorText(error: unknown, t: TFunction): string {
  if (error instanceof DirectoryError && error.retryAfter !== undefined) {
    return t('directory.rate_limited', { seconds: error.retryAfter });
  }
  return t(`errors.${error instanceof DirectoryError ? error.code : 'INTERNAL_ERROR'}`);
}

function FilterSheet({
  visible,
  value,
  onClose,
  onApply,
}: {
  readonly visible: boolean;
  readonly value: DirectoryFilters;
  readonly onClose: () => void;
  readonly onApply: (next: DirectoryFilters) => void;
}) {
  const { t, i18n } = useTranslation();
  const regions = useRegionOptions(i18n.language);
  const activities = useActivityOptions(i18n.language);
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (visible) setDraft(value);
  }, [visible, value]);
  const regionOptions = [
    { id: '', label: t('directory.filter.region_default') },
    ...(regions.data ?? []),
  ];
  const activityOptions = [
    { id: '', label: t('directory.filter.activity_all') },
    ...(activities.data ?? []),
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityLabel={t('directory.mobile.apply')}
      />
      <View style={styles.sheet}>
        <Text style={styles.sheetTitle} accessibilityRole="header">
          {t('directory.mobile.filters')}
        </Text>
        <OptionField
          label={t('directory.filter.region')}
          value={draft.regionId}
          options={regionOptions}
          onChange={(regionId) => {
            setDraft((prev) => ({ ...prev, regionId }));
          }}
          testID="directory-region"
        />
        <OptionField
          label={t('directory.filter.activity')}
          value={draft.activityTypeId}
          options={activityOptions}
          onChange={(activityTypeId) => {
            setDraft((prev) => ({ ...prev, activityTypeId }));
          }}
          testID="directory-activity"
        />
        <View style={styles.switchRow}>
          <Text style={styles.rowValue}>{t('directory.filter.verified')}</Text>
          <Switch
            value={draft.verifiedOnly}
            trackColor={{ true: colors.accent, false: colors.borderStrong }}
            onValueChange={(verifiedOnly) => {
              setDraft((prev) => ({ ...prev, verifiedOnly }));
            }}
          />
        </View>
        <View style={styles.sheetActions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setDraft({ ...EMPTY_FILTERS, q: draft.q });
            }}
            style={({ pressed: isPressed }) => [styles.secondary, isPressed && pressed]}
          >
            <Text style={styles.secondaryText}>{t('directory.mobile.clear')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              onApply(draft);
            }}
            style={({ pressed: isPressed }) => [styles.primary, styles.flex, isPressed && pressed]}
          >
            <Text style={styles.primaryText}>{t('directory.mobile.apply')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export function DirectoryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { activeBusinessId } = useShell();
  const [mode, setMode] = useState<Mode>('filter');
  const [filters, setFilters] = useState<DirectoryFilters>(EMPTY_FILTERS);
  const [debounced, setDebounced] = useState(filters);
  const [sheet, setSheet] = useState(false);
  const [exactInput, setExactInput] = useState('');
  const [exact, setExact] = useState<ReturnType<typeof parseExactLookup>>();
  const [exactInvalid, setExactInvalid] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(filters);
    }, 300);
    return () => {
      clearTimeout(timer);
    };
  }, [filters]);

  const search = useDirectorySearch(activeBusinessId, debounced, mode === 'filter');
  const lookup = useExactLookup(activeBusinessId, mode === 'exact' ? exact : undefined);
  const active = mode === 'filter' ? search : lookup;
  const items = useMemo(
    () =>
      mode === 'filter'
        ? (search.data?.pages.flatMap((page) => page.items) ?? [])
        : (lookup.data?.items ?? []),
    [mode, search.data, lookup.data],
  );
  const emptyReason = mode === 'filter' ? (search.data?.pages[0]?.emptyReason ?? null) : null;
  const filterCount =
    (filters.regionId === '' ? 0 : 1) +
    (filters.activityTypeId === '' ? 0 : 1) +
    (filters.verifiedOnly ? 1 : 0);

  const header = (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          router.back();
        }}
        style={({ pressed: isPressed }) => [styles.back, isPressed && pressed]}
      >
        <Text style={styles.backText}>← {t('directory.mobile.back')}</Text>
      </Pressable>
      <Text style={styles.title} accessibilityRole="header">
        {t('directory.title')}
      </Text>
      <Text style={styles.meta}>{t('directory.description')}</Text>
      <View style={styles.segment} accessibilityRole="tablist">
        {(['filter', 'exact'] as const).map((key) => (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected: mode === key }}
            onPress={() => {
              setMode(key);
            }}
            style={({ pressed: isPressed }) => [
              styles.segmentItem,
              mode === key && styles.segmentActive,
              isPressed && pressed,
            ]}
          >
            <Text style={[styles.segmentText, mode === key && styles.segmentTextActive]}>
              {t(`directory.mode.${key}`)}
            </Text>
          </Pressable>
        ))}
      </View>
      {mode === 'filter' ? (
        <View style={styles.searchRow}>
          <TextInput
            value={filters.q}
            onChangeText={(q) => {
              setFilters((prev) => ({ ...prev, q }));
            }}
            placeholder={t('directory.mobile.search_placeholder')}
            placeholderTextColor={colors.textSubtle}
            maxLength={100}
            returnKeyType="search"
            accessibilityLabel={t('directory.filter.q')}
            style={[styles.input, styles.flex]}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setSheet(true);
            }}
            style={({ pressed: isPressed }) => [styles.secondary, isPressed && pressed]}
          >
            <Text style={styles.secondaryText}>
              {t('directory.mobile.filters')}
              {filterCount > 0 ? ` · ${String(filterCount)}` : ''}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.exactBox}>
          <TextInput
            value={exactInput}
            onChangeText={(value) => {
              setExactInput(value);
              setExactInvalid(false);
            }}
            onSubmitEditing={() => {
              const parsed = parseExactLookup(exactInput);
              setExactInvalid(parsed === undefined);
              setExact(parsed);
            }}
            keyboardType="phone-pad"
            returnKeyType="search"
            placeholder="+994 50 123 45 67 · 1234567891"
            placeholderTextColor={colors.textSubtle}
            accessibilityLabel={t('directory.exact.label')}
            style={[styles.input, exactInvalid && styles.inputInvalid]}
          />
          <Text style={exactInvalid ? styles.error : styles.hint} accessibilityLiveRegion="polite">
            {exactInvalid ? t('directory.exact.invalid') : t('directory.exact.hint')}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              const parsed = parseExactLookup(exactInput);
              setExactInvalid(parsed === undefined);
              setExact(parsed);
            }}
            style={({ pressed: isPressed }) => [styles.primary, isPressed && pressed]}
          >
            <Text style={styles.primaryText}>{t('directory.exact.submit')}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );

  const waiting = mode === 'exact' && exact === undefined;
  const empty = waiting ? undefined : active.isError ? (
    <View style={[styles.card, styles.errorCard]} accessibilityRole="alert">
      <Text style={styles.error}>{errorText(active.error, t)}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => void active.refetch()}
        style={({ pressed: isPressed }) => [styles.secondary, isPressed && pressed]}
      >
        <Text style={styles.secondaryText}>{t('directory.retry')}</Text>
      </Pressable>
    </View>
  ) : active.isPending ? (
    <ActivityIndicator style={styles.loader} color={colors.accent} />
  ) : emptyReason === 'no_assigned_regions' ? (
    <Message
      title={t('directory.empty.no_regions_title')}
      body={t('directory.empty.no_assigned_regions')}
    />
  ) : emptyReason === 'no_service_areas' ? (
    <Message
      title={t('directory.empty.no_service_areas_title')}
      body={t('directory.empty.no_service_areas')}
    />
  ) : (
    <Message
      title={t('directory.empty.none_title')}
      body={mode === 'exact' ? t('directory.exact.none') : t('directory.empty.none')}
    />
  );

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <BuyerCard buyer={item} />}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={
          mode === 'filter' && search.isFetchingNextPage ? (
            <ActivityIndicator style={styles.loader} color={colors.accent} />
          ) : undefined
        }
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (mode === 'filter' && search.hasNextPage && !search.isFetchingNextPage) {
            void search.fetchNextPage();
          }
        }}
        refreshing={mode === 'filter' && search.isRefetching && !search.isFetchingNextPage}
        onRefresh={() => void active.refetch()}
      />
      <FilterSheet
        visible={sheet}
        value={filters}
        onClose={() => {
          setSheet(false);
        }}
        onApply={(next) => {
          setFilters(next);
          setSheet(false);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { padding: space.xl, gap: space.lg, paddingBottom: space.xxl * 2 },
  flex: { flex: 1 },
  header: { gap: space.md, marginBottom: space.sm },
  back: { alignSelf: 'flex-start', minHeight: touchTarget, justifyContent: 'center' },
  backText: { fontSize: 15, fontWeight: '600', color: colors.accent },
  title: { fontSize: 26, fontWeight: '700', color: colors.text },
  meta: { fontSize: 14, lineHeight: 20, color: colors.textMuted },
  segment: {
    flexDirection: 'row',
    gap: space.xs,
    padding: space.xs,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...softShadow(1),
  },
  segmentItem: {
    flex: 1,
    minHeight: touchTarget,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
  },
  segmentActive: { backgroundColor: colors.accent },
  segmentText: { fontSize: 13, fontWeight: '600', color: colors.textMuted, textAlign: 'center' },
  segmentTextActive: { color: colors.onAccent },
  searchRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  exactBox: { gap: space.sm },
  input: {
    minHeight: 48,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: space.lg,
    fontSize: 16,
    color: colors.text,
  },
  inputInvalid: { borderColor: colors.danger },
  hint: { fontSize: 13, color: colors.textMuted },
  error: { fontSize: 13, color: colors.danger, fontWeight: '500' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.xl,
    gap: space.md,
    ...softShadow(1),
  },
  errorCard: { backgroundColor: colors.dangerSoft },
  cardHead: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  logo: { width: 48, height: 48, borderRadius: radius.md },
  logoFallback: { backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  logoText: { color: colors.onAccent, fontWeight: '700', fontSize: 16 },
  name: { fontSize: 17, fontWeight: '600', color: colors.text },
  badge: {
    backgroundColor: '#ecfdf5', // emerald-50
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
  badgeText: { color: '#047857', fontSize: 12, fontWeight: '600' }, // emerald-700
  row: {
    minHeight: touchTarget,
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.surfaceMuted,
    paddingTop: space.sm,
  },
  rowLabel: { fontSize: 12, fontWeight: '500', color: colors.textMuted },
  rowValue: { fontSize: 15, color: colors.text, fontVariant: ['tabular-nums'] },
  link: { color: colors.accent, fontWeight: '600' },
  hidden: { fontSize: 12, color: colors.textSubtle },
  loader: { marginTop: space.xl },
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.35)' },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: space.xl,
    paddingBottom: space.xxl,
    gap: space.lg,
    ...softShadow(3),
  },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: touchTarget,
  },
  sheetActions: { flexDirection: 'row', gap: space.md },
  primary: {
    minHeight: touchTarget + 4,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    ...softShadow(2),
  },
  primaryText: { color: colors.onAccent, fontSize: 16, fontWeight: '600' },
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
  secondaryText: { color: colors.text, fontSize: 15, fontWeight: '600' },
});
