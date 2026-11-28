// Depo stok ekranı — mobil (F3.11d; US-039 AC1, AC6, AC7; web F3.11b karşılığı). UX kararları:
// - Üstte geri, başlık, açıklama. Mod `quantity` değilse bilgi kartı: stok şimdi girilebilir,
//   perakendeci mod açılınca görür; mod web'de Ayarlar › Stok'tan açılır (K1, mobilde ayar yok).
// - Depo çipleri (tek depo varsa yalnız ad), arama (300 ms bekler), süzgeç: Hamısı / Az qalan /
//   Sayılmayıb.
// - Her ürün bir kart: ad + SKU, durum rozeti, büyük yazıyla satılabilir miktar ("12 koli + 6 əd"),
//   altında temel birim, mövcud ve rezerv. Düğmeler: Mal girişi, Sayım (yalnız `inventory.manage`),
//   Tarixçə (sayılmış satırda). Hepsi ≥44 pt, basınca opaklık + ölçek.
// - Liste sonunda sonraki sayfa, aşağı çekince yenilenir. Yükleniyor, boş (süzgece göre), deposuz
//   ve hata durumları; hata kartında yeniden dene. İşlem sonrası tek satırlık yeşil durum.
import {
  inventoryAccess,
  pickLocalizedText,
  STOCK_ITEM_FILTERS,
  STOCK_ITEM_QUERY_MAX,
  type StockItemFilter,
} from '@b2b/shared';
import { useRouter } from 'expo-router';
import { type ReactElement, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, pressed, radius, softShadow, space, touchTarget } from '../../lib/theme';
import { useShell } from '../shell/use-shell';
import { type StockItem, StockError } from './api';
import { HistorySheet } from './history-sheet';
import { MovementSheet } from './movement-sheet';
import { useStockItems, useStockMode, useStockWarehouses } from './queries';
import { type StockStatus, stockStatus } from './stock-form';
import { useQtyText } from './stock-qty';

interface Sheet {
  readonly kind: 'receipt' | 'adjustment' | 'history';
  readonly item: StockItem;
}

const BADGE: Record<StockStatus, { bg: string; fg: string }> = {
  uncounted: { bg: colors.surfaceMuted, fg: '#475569' }, // slate-600
  out: { bg: '#fffbeb', fg: '#b45309' }, // amber-50 / amber-700
  low: { bg: '#fffbeb', fg: '#b45309' },
  in: { bg: '#ecfdf5', fg: '#047857' }, // emerald-50 / emerald-700
};

function ItemCard({
  item,
  canManage,
  onOpen,
}: {
  readonly item: StockItem;
  readonly canManage: boolean;
  readonly onOpen: (sheet: Sheet) => void;
}) {
  const { t, i18n } = useTranslation();
  const qtyText = useQtyText();
  const status = stockStatus(item);
  const badge = BADGE[status];
  const available = item.available === null ? null : qtyText(item.available, item);
  const name = pickLocalizedText(item.productName, i18n.language) ?? item.sku;

  const action = (kind: Sheet['kind'], label: string) => (
    <Pressable
      key={kind}
      accessibilityRole="button"
      onPress={() => {
        onOpen({ kind, item });
      }}
      style={({ pressed: isPressed }) => [
        styles.action,
        kind === 'receipt' && styles.actionPrimary,
        isPressed && pressed,
      ]}
      testID={`stock-${kind}-${item.sku}`}
    >
      <Text style={[styles.actionText, kind === 'receipt' && styles.actionTextPrimary]}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <View style={styles.card} testID={`stock-item-${item.sku}`}>
      <View style={styles.cardHead}>
        <View style={styles.flex}>
          <Text style={styles.name} numberOfLines={2}>
            {name}
          </Text>
          <Text style={styles.sku}>{item.sku}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: badge.bg }]}>
          <Text style={[styles.badgeText, { color: badge.fg }]}>{t(`stock.status.${status}`)}</Text>
        </View>
      </View>
      {available === null ? (
        <Text style={styles.uncounted}>—</Text>
      ) : (
        <View>
          <Text style={styles.label}>{t('stock.col.available')}</Text>
          <Text style={styles.qty}>{available.primary}</Text>
          {available.base !== null && <Text style={styles.qtyBase}>{available.base}</Text>}
        </View>
      )}
      {item.counted && (
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.label}>{t('stock.col.on_hand')}</Text>
            <Text style={styles.statValue}>{qtyText(item.onHand ?? '0', item).primary}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.label}>{t('stock.col.reserved')}</Text>
            <Text style={styles.statValue}>{qtyText(item.reserved ?? '0', item).primary}</Text>
          </View>
        </View>
      )}
      {(canManage || item.counted) && (
        <View style={styles.actions}>
          {canManage && action('receipt', t('stock.action.receipt'))}
          {canManage && action('adjustment', t('stock.action.count'))}
          {item.counted && action('history', t('stock.action.history'))}
        </View>
      )}
    </View>
  );
}

function InfoCard({
  title,
  body,
  tone = 'plain',
  onRetry,
}: {
  readonly title?: string;
  readonly body: string;
  readonly tone?: 'plain' | 'error' | 'accent';
  readonly onRetry?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View
      style={[
        styles.card,
        tone === 'error' && styles.errorCard,
        tone === 'accent' && styles.accentCard,
      ]}
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
    >
      {title !== undefined && <Text style={styles.name}>{title}</Text>}
      <Text style={tone === 'error' ? styles.errorText : styles.meta}>{body}</Text>
      {onRetry !== undefined && (
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          style={({ pressed: isPressed }) => [styles.action, isPressed && pressed]}
        >
          <Text style={styles.actionText}>{t('stock.mobile.retry')}</Text>
        </Pressable>
      )}
    </View>
  );
}

export function StockScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const shell = useShell();
  const businessId = shell.activeBusinessId;
  const codes = (shell.me?.activeBusiness?.permissions ?? []).map((p) => p.code);
  const access = inventoryAccess(codes);
  const mode = useStockMode(businessId);
  const warehouses = useStockWarehouses(businessId);
  const [warehouseId, setWarehouseId] = useState<string>();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<StockItemFilter>('all');
  const [sheet, setSheet] = useState<Sheet>();
  const [done, setDone] = useState<string>();
  const warehouseList = warehouses.data ?? [];

  useEffect(() => {
    const list = warehouses.data ?? [];
    if (warehouseId !== undefined && list.some((w) => w.id === warehouseId)) return;
    setWarehouseId((list.find((w) => w.isDefault) ?? list[0])?.id);
  }, [warehouses.data, warehouseId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(search);
    }, 300);
    return () => {
      clearTimeout(timer);
    };
  }, [search]);

  const items = useStockItems(businessId, warehouseId, q, filter);
  const rows = items.data?.pages.flatMap((page) => page.items) ?? [];

  const header = (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          router.back();
        }}
        style={({ pressed: isPressed }) => [styles.back, isPressed && pressed]}
      >
        <Text style={styles.backText}>← {t('stock.mobile.back')}</Text>
      </Pressable>
      <Text style={styles.eyebrow}>{t('stock.eyebrow')}</Text>
      <Text style={styles.title} accessibilityRole="header">
        {t('stock.title')}
      </Text>
      <Text style={styles.meta}>{t('stock.description')}</Text>
      {mode.data !== undefined && mode.data !== 'quantity' && (
        <InfoCard tone="accent" body={`${t('stock.mode_banner')} ${t('stock.mobile.web_hint')}`} />
      )}
      {warehouseList.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          accessibilityLabel={t('stock.warehouse')}
        >
          {warehouseList.map((w) => {
            const selected = w.id === warehouseId;
            return (
              <Pressable
                key={w.id}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => {
                  setWarehouseId(w.id);
                  setDone(undefined);
                }}
                style={({ pressed: isPressed }) => [
                  styles.chip,
                  selected && styles.chipActive,
                  isPressed && pressed,
                ]}
                testID={`stock-warehouse-${w.id}`}
              >
                <Text
                  style={[styles.chipText, selected && styles.chipTextActive]}
                  numberOfLines={1}
                >
                  {w.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
      {warehouseList.length === 1 && (
        <Text style={styles.warehouseName}>
          {t('stock.warehouse')}: {warehouseList[0]?.name}
        </Text>
      )}
      {warehouseList.length > 0 && (
        <>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t('stock.search')}
            placeholderTextColor={colors.textSubtle}
            maxLength={STOCK_ITEM_QUERY_MAX}
            returnKeyType="search"
            accessibilityLabel={t('stock.search')}
            style={styles.input}
            testID="stock-search"
          />
          <View style={styles.segment} accessibilityRole="tablist">
            {STOCK_ITEM_FILTERS.map((key) => (
              <Pressable
                key={key}
                accessibilityRole="tab"
                accessibilityState={{ selected: filter === key }}
                onPress={() => {
                  setFilter(key);
                }}
                style={({ pressed: isPressed }) => [
                  styles.segmentItem,
                  filter === key && styles.segmentActive,
                  isPressed && pressed,
                ]}
                testID={`stock-filter-${key}`}
              >
                <Text style={[styles.segmentText, filter === key && styles.segmentTextActive]}>
                  {t(`stock.filter.${key}`)}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
      {done !== undefined && (
        <View style={styles.done} accessibilityLiveRegion="polite" testID="stock-done">
          <Text style={styles.doneText}>✓ {done}</Text>
        </View>
      )}
    </View>
  );

  let empty: ReactElement | undefined;
  if (warehouses.isError) {
    const code = warehouses.error instanceof StockError ? warehouses.error.code : 'INTERNAL_ERROR';
    empty = (
      <InfoCard tone="error" body={t(`errors.${code}`)} onRetry={() => void warehouses.refetch()} />
    );
  } else if (warehouses.data === undefined) {
    empty = undefined;
  } else if (warehouseList.length === 0) {
    empty = <InfoCard body={t('stock.no_warehouse')} />;
  } else if (items.isError) {
    const code = items.error instanceof StockError ? items.error.code : 'INTERNAL_ERROR';
    empty = (
      <InfoCard tone="error" body={t(`errors.${code}`)} onRetry={() => void items.refetch()} />
    );
  } else if (items.data !== undefined && rows.length === 0) {
    empty = <InfoCard body={t(`stock.empty.${filter}`)} />;
  }
  const loading =
    !warehouses.isError &&
    (warehouses.data === undefined || (warehouseList.length > 0 && items.isLoading));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={empty === undefined ? rows : []}
        keyExtractor={(item) => item.variantId}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header}
        ListEmptyComponent={loading ? <ActivityIndicator style={styles.loader} /> : empty}
        renderItem={({ item }) => (
          <ItemCard
            item={item}
            canManage={access.manage}
            onOpen={(next) => {
              setDone(undefined);
              setSheet(next);
            }}
          />
        )}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (items.hasNextPage && !items.isFetchingNextPage) void items.fetchNextPage();
        }}
        ListFooterComponent={
          items.isFetchingNextPage ? <ActivityIndicator style={styles.loader} /> : undefined
        }
        refreshing={items.isRefetching && !items.isFetchingNextPage}
        onRefresh={() => {
          void Promise.all([warehouses.refetch(), mode.refetch(), items.refetch()]);
        }}
        testID="stock-screen"
      />
      {sheet !== undefined && warehouseId !== undefined && sheet.kind !== 'history' && (
        <MovementSheet
          businessId={businessId}
          warehouseId={warehouseId}
          item={sheet.item}
          type={sheet.kind}
          onClose={() => {
            setSheet(undefined);
          }}
          onDone={(message) => {
            setSheet(undefined);
            setDone(message);
          }}
        />
      )}
      {sheet?.kind === 'history' && warehouseId !== undefined && (
        <HistorySheet
          businessId={businessId}
          warehouseId={warehouseId}
          item={sheet.item}
          onClose={() => {
            setSheet(undefined);
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
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.accent,
  },
  title: { fontSize: 26, fontWeight: '700', color: colors.text },
  meta: { fontSize: 14, lineHeight: 20, color: colors.textMuted },
  warehouseName: { fontSize: 14, fontWeight: '600', color: colors.text },
  chips: { gap: space.sm, paddingVertical: 2 },
  chip: {
    minHeight: touchTarget,
    maxWidth: 220,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.text },
  chipTextActive: { color: colors.onAccent },
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
    paddingHorizontal: space.xs,
  },
  segmentActive: { backgroundColor: colors.accent },
  segmentText: { fontSize: 13, fontWeight: '600', color: colors.textMuted, textAlign: 'center' },
  segmentTextActive: { color: colors.onAccent },
  done: { backgroundColor: '#ecfdf5', borderRadius: radius.md, padding: space.md },
  doneText: { color: '#047857', fontSize: 14, fontWeight: '600' },
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
  accentCard: { backgroundColor: colors.accentSoft, borderColor: 'rgba(79, 70, 229, 0.15)' },
  errorText: { fontSize: 14, color: colors.danger, fontWeight: '500' },
  cardHead: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  name: { fontSize: 17, fontWeight: '600', color: colors.text },
  sku: { fontSize: 13, color: colors.textMuted, fontVariant: ['tabular-nums'], marginTop: 2 },
  badge: { borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 3 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  label: { fontSize: 12, fontWeight: '500', color: colors.textMuted },
  qty: { fontSize: 24, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  qtyBase: { fontSize: 13, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  uncounted: { fontSize: 24, fontWeight: '700', color: colors.textSubtle },
  statsRow: {
    flexDirection: 'row',
    gap: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceMuted,
    paddingTop: space.md,
  },
  stat: { flex: 1, gap: 2 },
  statValue: { fontSize: 15, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  action: {
    flexGrow: 1,
    minHeight: touchTarget,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  actionPrimary: { backgroundColor: colors.accent, borderColor: colors.accent, ...softShadow(1) },
  actionText: { fontSize: 14, fontWeight: '600', color: colors.text },
  actionTextPrimary: { color: colors.onAccent },
  loader: { marginTop: space.xl },
});
