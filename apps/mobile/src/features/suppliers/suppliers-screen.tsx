// Toptancılarım — mobil (F2.15b; US-025). UX kararları:
// - Başlık + iki çip: Aktiv / Ləğv edilib (seçili çip Indigo dolgu).
// - Her bağlantı bir kart: toptancı ünvanı, bağlantı tarihi; altında iki küçük kutu (kredi limiti,
//   vade, `tabular-nums`). İptal edilmiş kartta bitiş tarihi + kimin iptal ettiği (gerekçe yok, K2 = A).
// - Aktif kartta "Əlaqəni ləğv et" (gül rengi metinli ikincil düğme, `connections.cancel`) iptal
//   sayfasını açar. "Yeniden bağlan" hiçbir yerde yok (US-025 AC6).
// - Aşağı çekince yenilenir; boş durum sekmeye göre; hata kartında yeniden dene.
import {
  connectionEndedLabel,
  CREDIT_LIMIT_CURRENCY,
  type ConnectionStatus,
  CONNECTION_STATUSES,
  customersAccess,
  formatMoney,
} from '@b2b/shared';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, pressed, radius, softShadow, space, touchTarget } from '../../lib/theme';
import { ConnectionRequestError } from '../connection-requests/api';
import { useConnectionContext } from '../connection-requests/queries';
import { useShell } from '../shell/use-shell';
import type { ConnectionItem } from './api';
import { CancelSheet } from './cancel-sheet';
import { useSuppliers } from './queries';

function SupplierCard({
  item,
  canCancel,
  onCancel,
}: {
  readonly item: ConnectionItem;
  readonly canCancel: boolean;
  readonly onCancel: (item: ConnectionItem) => void;
}) {
  const { t } = useTranslation();
  const { formatDay, language } = useConnectionContext();
  const active = item.status === 'active';
  const limit =
    item.terms.creditLimit === null
      ? t('customers.row.no_limit')
      : formatMoney(
          { amount: item.terms.creditLimit, currency: CREDIT_LIMIT_CURRENCY.code },
          language,
          CREDIT_LIMIT_CURRENCY,
        );
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        {item.counterpartyName === null ? (
          <Text style={[styles.flex, styles.closed]}>{t('customers.closed_business')}</Text>
        ) : (
          <Text style={[styles.flex, styles.name]} numberOfLines={2}>
            {item.counterpartyName}
          </Text>
        )}
        {!active && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{t('customers.row.cancelled')}</Text>
          </View>
        )}
      </View>
      <Text style={styles.meta}>
        {t('customers.row.since', { date: formatDay(item.startedAt) })}
        {item.endedAt !== null &&
          ` · ${t('customers.row.ended', { date: formatDay(item.endedAt) })}`}
      </Text>
      {!active && item.endedBySide !== null && (
        <Text style={styles.meta}>
          {t(`customers.row.${connectionEndedLabel(item.endedBySide, 'buyer')}`)}
        </Text>
      )}
      <View style={styles.terms}>
        <View style={styles.term}>
          <Text style={styles.termLabel}>{t('customers.row.credit_limit')}</Text>
          <Text style={styles.termValue} numberOfLines={1}>
            {limit}
          </Text>
        </View>
        <View style={styles.term}>
          <Text style={styles.termLabel}>{t('customers.row.payment_term')}</Text>
          <Text style={styles.termValue}>
            {t('customers.row.days', { days: item.terms.paymentTermDays })}
          </Text>
        </View>
      </View>
      {active && canCancel && (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            onCancel(item);
          }}
          style={({ pressed: isPressed }) => [styles.secondary, isPressed && pressed]}
        >
          <Text style={[styles.secondaryText, styles.dangerText]}>{t('customers.row.cancel')}</Text>
        </Pressable>
      )}
    </View>
  );
}

export function SuppliersScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const shell = useShell();
  const { businessId, meLoaded } = useConnectionContext();
  const codes = (shell.me?.activeBusiness?.permissions ?? []).map((item) => item.code);
  const access = customersAccess(codes);
  const [tab, setTab] = useState<ConnectionStatus>('active');
  const [cancelling, setCancelling] = useState<ConnectionItem | undefined>();
  const list = useSuppliers(access.view ? businessId : undefined, tab);
  const items = useMemo(() => list.data?.pages.flatMap((page) => page.items) ?? [], [list.data]);

  const header = (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          router.back();
        }}
        style={({ pressed: isPressed }) => [styles.back, isPressed && pressed]}
      >
        <Text style={styles.backText}>← {t('connections.mobile.back')}</Text>
      </Pressable>
      <Text style={styles.title} accessibilityRole="header">
        {t('suppliers.title')}
      </Text>
      <Text style={styles.meta}>{t('suppliers.description')}</Text>
      <View style={styles.chips} accessibilityRole="tablist">
        {CONNECTION_STATUSES.map((key) => {
          const selected = key === tab;
          return (
            <Pressable
              key={key}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => {
                setTab(key);
              }}
              style={({ pressed: isPressed }) => [
                styles.chip,
                selected && styles.chipActive,
                isPressed && pressed,
              ]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                {t(`customers.tab.${key}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const empty =
    meLoaded && !access.view ? (
      <View style={styles.card}>
        <Text style={styles.meta} accessibilityRole="alert">
          {t('suppliers.no_access')}
        </Text>
      </View>
    ) : list.isError ? (
      <View style={[styles.card, styles.errorCard]} accessibilityRole="alert">
        <Text style={styles.error}>
          {t(
            `errors.${list.error instanceof ConnectionRequestError ? list.error.message : 'INTERNAL_ERROR'}`,
          )}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => void list.refetch()}
          style={({ pressed: isPressed }) => [styles.secondary, isPressed && pressed]}
        >
          <Text style={styles.secondaryText}>{t('customers.retry')}</Text>
        </Pressable>
      </View>
    ) : list.isPending ? (
      <ActivityIndicator style={styles.loader} color={colors.accent} />
    ) : (
      <View style={styles.card}>
        <Text style={styles.name}>{t('suppliers.empty_title')}</Text>
        <Text style={styles.meta}>
          {tab === 'active' ? t('suppliers.empty_active') : t('suppliers.empty_cancelled')}
        </Text>
      </View>
    );

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <SupplierCard item={item} canCancel={access.cancel} onCancel={setCancelling} />
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={
          list.isFetchingNextPage ? (
            <ActivityIndicator style={styles.loader} color={colors.accent} />
          ) : undefined
        }
        contentContainerStyle={styles.list}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
        }}
        refreshing={list.isRefetching && !list.isFetchingNextPage}
        onRefresh={() => void list.refetch()}
      />
      {cancelling !== undefined && (
        <CancelSheet
          businessId={businessId}
          connectionId={cancelling.id}
          name={cancelling.counterpartyName ?? t('customers.closed_business')}
          onClose={() => {
            setCancelling(undefined);
          }}
        />
      )}
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
  meta: { fontSize: 14, lineHeight: 20, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  chips: { flexDirection: 'row', gap: space.sm, paddingVertical: space.xs },
  chip: {
    minHeight: touchTarget,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  chipTextActive: { color: colors.onAccent },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.xl,
    gap: space.sm,
    ...softShadow(1),
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  name: { fontSize: 17, fontWeight: '600', color: colors.text },
  closed: { fontSize: 15, fontStyle: 'italic', color: colors.textSubtle },
  badge: {
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    backgroundColor: colors.surfaceMuted,
  },
  badgeText: { fontSize: 12, fontWeight: '600', color: '#475569' }, // slate-600
  terms: { flexDirection: 'row', gap: space.sm, marginTop: space.xs },
  term: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    padding: space.md,
    gap: 2,
  },
  termLabel: { fontSize: 12, color: colors.textMuted },
  termValue: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  errorCard: { backgroundColor: colors.dangerSoft },
  error: { fontSize: 13, color: colors.danger, fontWeight: '500' },
  loader: { marginTop: space.xl },
  secondary: {
    minHeight: touchTarget,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    marginTop: space.xs,
  },
  secondaryText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  dangerText: { color: colors.danger },
});
