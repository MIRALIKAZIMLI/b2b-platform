// Gönderilen bağlantı istekleri — mobil (F2.12b; US-021). UX kararları:
// - Başlık + yatay kayan durum çipleri (Hamısı, Gözləyir, …); seçili çip Indigo dolgu.
// - Her istek bir kart: ünvan (kapanmış işletmede silik not), durum rozeti, gönderilme tarihi,
//   bekleyende son yanıt tarihi, mesaj (3 satır), önerilen vade.
// - Liste sonunda sonraki sayfa; aşağı çekince yenilenir. Boş durum süzgece göre; boşta "Pərakəndəçi
//   tap" dizine götürür. Hata kartında yeniden dene.
// - F2.13b: bekleyen kartta "Geri çək" (gül rengi metin, ikincil) onay sayfası açar (US-022 AC1).
import { CONNECTION_REQUEST_STATUSES, type ConnectionRequestStatus } from '@b2b/shared';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, pressed, radius, softShadow, space, touchTarget } from '../../lib/theme';
import { ConnectionRequestError, type OutgoingRequest } from './api';
import { ConfirmSheet } from './confirm-sheet';
import { useConnectionContext, useOutgoingRequests } from './queries';

const FILTERS = ['all', ...CONNECTION_REQUEST_STATUSES] as const;
type Filter = (typeof FILTERS)[number];

const BADGE: Record<ConnectionRequestStatus, { bg: string; fg: string }> = {
  pending: { bg: '#fffbeb', fg: '#b45309' }, // amber-50 / amber-700
  accepted: { bg: '#ecfdf5', fg: '#047857' }, // emerald-50 / emerald-700
  rejected: { bg: colors.surfaceMuted, fg: '#475569' }, // slate-600
  expired: { bg: colors.surfaceMuted, fg: '#475569' },
  withdrawn: { bg: colors.surfaceMuted, fg: '#475569' },
};

function RequestCard({
  item,
  onWithdraw,
}: {
  readonly item: OutgoingRequest;
  readonly onWithdraw: (item: OutgoingRequest) => void;
}) {
  const { t } = useTranslation();
  const { formatDay, canSend } = useConnectionContext();
  const badge = item.status === undefined ? undefined : BADGE[item.status];
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        {item.buyerName === null ? (
          <Text style={[styles.flex, styles.closed]}>
            {t('connections.outgoing.closed_business')}
          </Text>
        ) : (
          <Text style={[styles.flex, styles.name]} numberOfLines={2}>
            {item.buyerName}
          </Text>
        )}
        {badge !== undefined && item.status !== undefined && (
          <View style={[styles.badge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.badgeText, { color: badge.fg }]}>
              {t(`connections.status.${item.status}`)}
            </Text>
          </View>
        )}
      </View>
      {item.createdAt !== undefined && (
        <Text style={styles.meta}>
          {t('connections.outgoing.sent_at', { date: formatDay(item.createdAt) })}
        </Text>
      )}
      {item.status === 'pending' && item.expiresAt !== undefined && (
        <Text style={styles.meta}>
          {t('connections.outgoing.expires_at', { date: formatDay(item.expiresAt) })}
        </Text>
      )}
      {item.message !== null && item.message !== undefined && (
        <Text style={styles.message} numberOfLines={3}>
          {item.message}
        </Text>
      )}
      {item.proposedPaymentTermDays !== null && item.proposedPaymentTermDays !== undefined && (
        <Text style={styles.term}>
          {t('connections.outgoing.term', { days: item.proposedPaymentTermDays })}
        </Text>
      )}
      {item.status === 'pending' && canSend && (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            onWithdraw(item);
          }}
          style={({ pressed: isPressed }) => [styles.secondary, isPressed && pressed]}
        >
          <Text style={[styles.secondaryText, styles.dangerText]}>
            {t('connections.outgoing.withdraw')}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

export function OutgoingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { businessId, canSend, meLoaded } = useConnectionContext();
  const [filter, setFilter] = useState<Filter>('all');
  const [withdrawing, setWithdrawing] = useState<OutgoingRequest | undefined>();
  const list = useOutgoingRequests(
    canSend ? businessId : undefined,
    filter === 'all' ? undefined : filter,
  );
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
        {t('connections.outgoing.title')}
      </Text>
      <Text style={styles.meta}>{t('connections.outgoing.description')}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        accessibilityRole="tablist"
      >
        {FILTERS.map((key) => {
          const active = key === filter;
          return (
            <Pressable
              key={key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => {
                setFilter(key);
              }}
              style={({ pressed: isPressed }) => [
                styles.chip,
                active && styles.chipActive,
                isPressed && pressed,
              ]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {key === 'all'
                  ? t('connections.outgoing.filter_all')
                  : t(`connections.status.${key}`)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  const empty =
    meLoaded && !canSend ? (
      <View style={styles.card}>
        <Text style={styles.meta} accessibilityRole="alert">
          {t('connections.outgoing.no_access')}
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
          <Text style={styles.secondaryText}>{t('connections.outgoing.retry')}</Text>
        </Pressable>
      </View>
    ) : list.isPending ? (
      <ActivityIndicator style={styles.loader} color={colors.accent} />
    ) : (
      <View style={styles.card}>
        <Text style={styles.name}>{t('connections.outgoing.empty_title')}</Text>
        <Text style={styles.meta}>
          {filter === 'all'
            ? t('connections.outgoing.empty')
            : t('connections.outgoing.empty_filtered')}
        </Text>
        {filter === 'all' && (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              router.push('/directory');
            }}
            style={({ pressed: isPressed }) => [styles.primary, isPressed && pressed]}
          >
            <Text style={styles.primaryText}>{t('connections.outgoing.go_directory')}</Text>
          </Pressable>
        )}
      </View>
    );

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={items}
        keyExtractor={(item, index) => item.id ?? String(index)}
        renderItem={({ item }) => <RequestCard item={item} onWithdraw={setWithdrawing} />}
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
      {withdrawing?.id !== undefined && (
        <ConfirmSheet
          action="withdraw"
          targetId={withdrawing.id}
          name={withdrawing.buyerName ?? t('connections.outgoing.closed_business')}
          onClose={() => {
            setWithdrawing(undefined);
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
  chips: { gap: space.sm, paddingVertical: space.xs },
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
  badge: { borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  message: { fontSize: 14, lineHeight: 20, color: colors.text },
  term: { fontSize: 13, fontWeight: '500', color: colors.textMuted, fontVariant: ['tabular-nums'] },
  errorCard: { backgroundColor: colors.dangerSoft },
  error: { fontSize: 13, color: colors.danger, fontWeight: '500' },
  loader: { marginTop: space.xl },
  primary: {
    minHeight: touchTarget + 4,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    marginTop: space.sm,
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
  dangerText: { color: '#e11d48' }, // rose-600
});
