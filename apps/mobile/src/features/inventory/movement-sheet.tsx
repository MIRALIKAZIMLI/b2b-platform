// Mal girişi ve sayım sayfası — mobil (F3.11d; US-039 AC1, AC7; S1 = A). UX kararları:
// - Alttan açılan sayfa; başlıkta ürün + SKU. Sayımda üstte şimdiki miktar (veya "ilk sayım").
// - Miktar (ondalık klavye) + birim çipleri (varyantın ambalajları; varsayılan "koli"); altında
//   anlık "= 144 əd" ve sayımda fark önizlemesi. Sunucuya her zaman temel birim gider (K2).
// - Mal girişinde parti no ve son kullanma (YYYY-AA-GG metni, K3), her ikisinde not.
// - `Idempotency-Key` sayfa açılınca bir kez; çift dokunuş ve yeniden deneme tek hareket.
// - Hata: doğrulama ve `STOCK_INSUFFICIENT` miktar alanının altında; diğerleri düğmenin üstünde.
// - Klavye açıkken içerik kaydırılır; arka plana dokunmak kapatır. Başarıda sayfa kapanır, ekranda
//   tek satırlık yeşil durum görünür.
import {
  createIdempotencyKey,
  pickLocalizedText,
  STOCK_LOT_NO_MAX,
  STOCK_NOTE_MAX,
  trimQty,
} from '@b2b/shared';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, pressed, radius, softShadow, space, touchTarget } from '../../lib/theme';
import { type StockItem, StockError } from './api';
import { useRecordMovement } from './queries';
import {
  BASE_CHOICE,
  buildMovement,
  countPreview,
  defaultUnitChoice,
  type MovementDraft,
  unitChoices,
} from './stock-form';
import { useQtyText, useSignedQtyText, useUnitAbbr } from './stock-qty';

export function MovementSheet({
  businessId,
  warehouseId,
  item,
  type,
  onClose,
  onDone,
}: {
  readonly businessId: string | undefined;
  readonly warehouseId: string;
  readonly item: StockItem;
  readonly type: 'receipt' | 'adjustment';
  readonly onClose: () => void;
  readonly onDone: (message: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const abbr = useUnitAbbr();
  const qtyText = useQtyText();
  const signed = useSignedQtyText();
  const key = useRef(createIdempotencyKey('stock'));
  const record = useRecordMovement(businessId, key.current);
  const choices = unitChoices(item);
  const [draft, setDraft] = useState<MovementDraft>({
    type,
    qty: '',
    unit: defaultUnitChoice(item),
    lotNo: '',
    expiry: '',
    note: '',
  });
  const [qtyError, setQtyError] = useState<string>();
  const [expiryError, setExpiryError] = useState<string>();
  const [general, setGeneral] = useState<string>();
  const product = pickLocalizedText(item.productName, i18n.language) ?? item.sku;

  const set = (patch: Partial<MovementDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  // Anlık önizleme: geçerli miktar varsa temel birim karşılığı ve (sayımda) fark.
  const preview = buildMovement({ ...draft, expiry: '' }, item, warehouseId);
  const previewQty = preview.ok ? preview.body.qty : null;
  const count =
    type === 'adjustment' && previewQty !== null ? countPreview(previewQty, item) : null;

  function submit() {
    if (record.isPending) return;
    setQtyError(undefined);
    setExpiryError(undefined);
    setGeneral(undefined);
    const result = buildMovement(draft, item, warehouseId);
    if (!result.ok) {
      if (result.field === 'qty') setQtyError(t(`stock.error.${result.error}`));
      else setExpiryError(t('stock.error.expiry_invalid'));
      return;
    }
    record.mutate(result.body, {
      onSuccess: (data) => {
        onDone(
          data.movement === null
            ? t('stock.done.unchanged', { product })
            : t(`stock.done.${type}`, { product, qty: qtyText(data.stock.onHand, item).primary }),
        );
      },
      onError: (error) => {
        const code = error instanceof StockError ? error.code : 'INTERNAL_ERROR';
        if (code === 'VALIDATION_FAILED') setQtyError(t('stock.error.qty_invalid'));
        else if (code === 'STOCK_INSUFFICIENT') setQtyError(t(`errors.${code}`));
        else setGeneral(t(`errors.${code}`));
      },
    });
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityLabel={t('stock.dialog.cancel')}
        />
        <View style={styles.sheet} testID={`stock-sheet-${type}`}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.eyebrow}>{t(`stock.dialog.${type}.title`)}</Text>
            <Text style={styles.title} accessibilityRole="header" numberOfLines={3}>
              {product}
            </Text>
            <Text style={styles.meta}>{item.sku}</Text>
            {type === 'adjustment' && (
              <View style={styles.info}>
                <Text style={styles.infoText}>
                  {item.counted
                    ? t('stock.dialog.adjustment.current', {
                        qty: qtyText(item.onHand ?? '0', item).primary,
                      })
                    : t('stock.dialog.adjustment.first')}
                </Text>
              </View>
            )}
            <View style={styles.field}>
              <Text style={styles.label}>{t(`stock.dialog.${type}.qty`)}</Text>
              <TextInput
                value={draft.qty}
                onChangeText={(qty) => {
                  set({ qty });
                  setQtyError(undefined);
                }}
                keyboardType="decimal-pad"
                autoFocus
                accessibilityLabel={t(`stock.dialog.${type}.qty`)}
                style={[styles.input, styles.qtyInput, qtyError !== undefined && styles.invalid]}
                testID="stock-sheet-qty"
              />
              <View style={styles.chips} accessibilityRole="radiogroup">
                {choices.map((choice) => {
                  const selected = draft.unit === choice.value;
                  return (
                    <Pressable
                      key={choice.value}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      onPress={() => {
                        set({ unit: choice.value });
                      }}
                      style={({ pressed: isPressed }) => [
                        styles.chip,
                        selected && styles.chipActive,
                        isPressed && pressed,
                      ]}
                      testID={`stock-sheet-unit-${choice.value}`}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                        {choice.value === BASE_CHOICE
                          ? abbr(choice.unitCode)
                          : t('stock.dialog.unit_option', {
                              unit: abbr(choice.unitCode),
                              qty: trimQty(choice.baseQty),
                              base: abbr(item.baseUnitCode),
                            })}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {qtyError !== undefined ? (
                <Text style={styles.error} accessibilityLiveRegion="polite">
                  {qtyError}
                </Text>
              ) : (
                <Text style={styles.hint}>{t(`stock.dialog.${type}.qty_hint`)}</Text>
              )}
              {previewQty !== null && draft.unit !== BASE_CHOICE && (
                <Text style={styles.hint} testID="stock-sheet-base">
                  {t('stock.dialog.equals', { qty: qtyText(previewQty, item).base ?? '' })}
                </Text>
              )}
              {count !== null && count.kind !== 'first' && (
                <Text style={styles.delta} testID="stock-sheet-delta">
                  {count.kind === 'same'
                    ? t('stock.dialog.adjustment.same')
                    : t('stock.dialog.adjustment.delta', { delta: signed(count.delta, item) })}
                </Text>
              )}
            </View>
            {type === 'receipt' && (
              <>
                <View style={styles.field}>
                  <Text style={styles.label}>{t('stock.dialog.lot')}</Text>
                  <TextInput
                    value={draft.lotNo}
                    onChangeText={(lotNo) => {
                      set({ lotNo });
                    }}
                    maxLength={STOCK_LOT_NO_MAX}
                    autoCapitalize="characters"
                    accessibilityLabel={t('stock.dialog.lot')}
                    style={styles.input}
                  />
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>{t('stock.dialog.expiry')}</Text>
                  <TextInput
                    value={draft.expiry}
                    onChangeText={(expiry) => {
                      set({ expiry });
                      setExpiryError(undefined);
                    }}
                    keyboardType="numbers-and-punctuation"
                    maxLength={10}
                    placeholder="2027-03-31"
                    placeholderTextColor={colors.textSubtle}
                    accessibilityLabel={t('stock.dialog.expiry')}
                    style={[styles.input, expiryError !== undefined && styles.invalid]}
                    testID="stock-sheet-expiry"
                  />
                  <Text
                    style={expiryError === undefined ? styles.hint : styles.error}
                    accessibilityLiveRegion="polite"
                  >
                    {expiryError ?? t('stock.dialog.expiry_hint')}
                  </Text>
                </View>
              </>
            )}
            <View style={styles.field}>
              <Text style={styles.label}>{t('stock.dialog.note')}</Text>
              <TextInput
                value={draft.note}
                onChangeText={(note) => {
                  set({ note });
                }}
                multiline
                maxLength={STOCK_NOTE_MAX}
                accessibilityLabel={t('stock.dialog.note')}
                style={[styles.input, styles.multiline]}
              />
            </View>
            {general !== undefined && (
              <View style={styles.errorBox} accessibilityRole="alert">
                <Text style={styles.error}>{general}</Text>
              </View>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: record.isPending }}
              disabled={record.isPending}
              onPress={submit}
              style={({ pressed: isPressed }) => [
                styles.primary,
                record.isPending && styles.disabled,
                isPressed && pressed,
              ]}
              testID="stock-sheet-submit"
            >
              <Text style={styles.primaryText}>
                {record.isPending ? t('stock.loading') : t(`stock.dialog.${type}.submit`)}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed: isPressed }) => [styles.secondary, isPressed && pressed]}
            >
              <Text style={styles.secondaryText}>{t('stock.dialog.cancel')}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, minHeight: 48, backgroundColor: 'rgba(15, 23, 42, 0.35)' },
  sheet: {
    maxHeight: '88%',
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    ...softShadow(3),
  },
  content: { padding: space.xl, paddingBottom: space.xxl, gap: space.md },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.accent,
  },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  info: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    padding: space.md,
  },
  infoText: { fontSize: 14, lineHeight: 20, color: colors.text },
  field: { gap: space.xs },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
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
  qtyInput: { fontSize: 22, fontWeight: '600', fontVariant: ['tabular-nums'] },
  multiline: { minHeight: 80, paddingTop: space.md, textAlignVertical: 'top' },
  invalid: { borderColor: colors.danger },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
  chip: {
    minHeight: touchTarget,
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
  hint: { fontSize: 12, color: colors.textMuted },
  delta: { fontSize: 15, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  error: { fontSize: 13, color: colors.danger, fontWeight: '500' },
  errorBox: { backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: space.md },
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
  disabled: { opacity: 0.6 },
  primaryText: { color: colors.onAccent, fontSize: 16, fontWeight: '600' },
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
