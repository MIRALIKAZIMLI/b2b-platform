// Hareket geçmişi sayfası — mobil (F3.11d; F3.11a `GET /stock/movements`). UX kararları:
// - Alttan açılan sayfa; her hareket bir satır: tür, işaretli fark (yeşil artı, gül eksi, sayımda
//   fark yoksa "Sayıldı"), tarih · parti · son kullanma, not. Yeniden eskiye; "Daha çox".
// - Yükleniyor, boş ve hata durumları; arka plana dokunmak kapatır.
import { pickLocalizedText, trimQty } from '@b2b/shared';
import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, pressed, radius, softShadow, space, touchTarget } from '../../lib/theme';
import type { StockItem } from './api';
import { useStockMovements } from './queries';
import { useSignedQtyText } from './stock-qty';

export function HistorySheet({
  businessId,
  warehouseId,
  item,
  onClose,
}: {
  readonly businessId: string | undefined;
  readonly warehouseId: string;
  readonly item: StockItem;
  readonly onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const signed = useSignedQtyText();
  const movements = useStockMovements(businessId, warehouseId, item.variantId);
  const rows = movements.data?.pages.flatMap((page) => page.items) ?? [];
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });

  let body: ReactNode;
  if (movements.isError) {
    body = (
      <View style={styles.errorBox} accessibilityRole="alert">
        <Text style={styles.error}>{t('stock.history.failed')}</Text>
      </View>
    );
  } else if (movements.data === undefined) {
    body = <ActivityIndicator style={styles.loader} />;
  } else if (rows.length === 0) {
    body = <Text style={styles.meta}>{t('stock.history.empty')}</Text>;
  } else {
    body = (
      <FlatList
        data={rows}
        keyExtractor={(row) => row.id}
        style={styles.list}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (movements.hasNextPage && !movements.isFetchingNextPage) {
            void movements.fetchNextPage();
          }
        }}
        ListFooterComponent={
          movements.isFetchingNextPage ? <ActivityIndicator style={styles.loader} /> : undefined
        }
        renderItem={({ item: row }) => {
          const zero = trimQty(row.onHandDelta) === '0';
          const negative = row.onHandDelta.startsWith('-');
          const meta = [
            date.format(new Date(row.createdAt)),
            row.lotNo === null ? null : t('stock.history.lot', { lot: row.lotNo }),
            row.expiryDate === null ? null : t('stock.history.expiry', { date: row.expiryDate }),
          ].filter((part): part is string => part !== null);
          return (
            <View style={styles.row}>
              <View style={styles.rowHead}>
                <Text style={styles.type}>{t(`stock.type.${row.type}`)}</Text>
                <Text
                  style={[
                    styles.amount,
                    zero ? styles.muted : negative ? styles.minus : styles.plus,
                  ]}
                >
                  {zero ? t('stock.history.counted') : signed(row.onHandDelta, item)}
                </Text>
              </View>
              <Text style={styles.meta}>{meta.join(' · ')}</Text>
              {row.note !== null && (
                <Text style={styles.note} numberOfLines={4}>
                  {row.note}
                </Text>
              )}
            </View>
          );
        }}
      />
    );
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityLabel={t('stock.history.close')}
      />
      <View style={styles.sheet} testID="stock-history">
        <Text style={styles.eyebrow}>{t('stock.history.title')}</Text>
        <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
          {pickLocalizedText(item.productName, i18n.language) ?? item.sku}
        </Text>
        <Text style={styles.meta}>{item.sku}</Text>
        {body}
        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={({ pressed: isPressed }) => [styles.secondary, isPressed && pressed]}
        >
          <Text style={styles.secondaryText}>{t('stock.history.close')}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.35)' },
  sheet: {
    maxHeight: '80%',
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: space.xl,
    paddingBottom: space.xxl,
    gap: space.md,
    ...softShadow(3),
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.accent,
  },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  list: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  row: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceMuted,
  },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  type: { fontSize: 15, fontWeight: '600', color: colors.text },
  amount: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'], flexShrink: 1 },
  plus: { color: '#059669' }, // emerald-600
  minus: { color: colors.danger },
  muted: { color: colors.textMuted },
  meta: { fontSize: 12, color: colors.textMuted },
  note: { fontSize: 13, color: colors.text },
  loader: { marginVertical: space.lg },
  error: { fontSize: 13, color: colors.danger, fontWeight: '500' },
  errorBox: { backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: space.md },
  secondary: {
    minHeight: touchTarget,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { color: colors.text, fontSize: 15, fontWeight: '600' },
});
