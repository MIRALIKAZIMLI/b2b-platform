// Onay sayfası — mobil (F2.13b; US-022 AC1, US-023 AC2–AC5): kabul, red, engel, engel kaldırma,
// geri çekme. UX kararları:
// - Alttan açılan sayfa: üst satırda eylem, başlıkta ünvan, altında ne olacağını söyleyen maddeler
//   (kabulde amber uyarı kutusu: veri paylaşımı; engelde bekleyen isteğin reddi + bağlantının
//   bitişi). Ana düğme ≥48 pt; yıkıcı eylemde gül rengi. "Bağla" ikincil, arka plan kapatır.
// - `Idempotency-Key` sayfa açılınca bir kez; hata sayfada; başarıda sayfa kapanır, listeler
//   yenilenir. Süresi dolmuş / yanıtlanmış istekte (409/404) onay düğmesi kalkar.
import { createIdempotencyKey, respondFailure } from '@b2b/shared';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, pressed, radius, softShadow, space, touchTarget } from '../../lib/theme';
import { type ConfirmAction, ConnectionRequestError } from './api';
import { useConfirmAction, useConnectionContext } from './queries';

const DESTRUCTIVE: ReadonlySet<ConfirmAction> = new Set(['reject', 'block', 'withdraw']);
/** Eylem başına madde sayısı (`connections.confirm.<eylem>.point_<n>`; web ile aynı). */
const POINTS: Readonly<Record<ConfirmAction, number>> = {
  accept: 3,
  reject: 2,
  block: 3,
  unblock: 1,
  withdraw: 1,
};
const DANGER = '#e11d48'; // rose-600
const AMBER_BG = '#fffbeb'; // amber-50
const AMBER_FG = '#92400e'; // amber-800

export function ConfirmSheet({
  action,
  targetId,
  name,
  onClose,
}: {
  readonly action: ConfirmAction;
  readonly targetId: string;
  readonly name: string;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation();
  const { businessId } = useConnectionContext();
  const run = useConfirmAction(businessId);
  const key = useRef(createIdempotencyKey('resp'));
  const destructive = DESTRUCTIVE.has(action);
  const failure =
    run.error === null
      ? undefined
      : respondFailure(run.error instanceof ConnectionRequestError ? run.error.body : undefined);

  function confirm() {
    if (run.isPending) return;
    run.mutate({ action, id: targetId, key: key.current }, { onSuccess: onClose });
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.flex}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityLabel={t('connections.confirm.cancel')}
        />
        <View style={styles.sheet}>
          <Text style={[styles.eyebrow, destructive && styles.eyebrowDanger]}>
            {t(`connections.confirm.${action}.eyebrow`)}
          </Text>
          <Text style={styles.title} accessibilityRole="header" numberOfLines={3}>
            {t(`connections.confirm.${action}.title`, { name })}
          </Text>
          <View style={[styles.points, action === 'accept' && styles.pointsWarn]}>
            {Array.from({ length: POINTS[action] }, (_, index) => (
              <View key={index} style={styles.point}>
                <View style={[styles.dot, action === 'accept' && styles.dotWarn]} />
                <Text style={[styles.pointText, action === 'accept' && styles.pointTextWarn]}>
                  {t(`connections.confirm.${action}.point_${String(index + 1)}`, { name })}
                </Text>
              </View>
            ))}
          </View>
          {failure !== undefined && (
            <View style={styles.errorBox} accessibilityRole="alert">
              <Text style={styles.error}>{t(failure.key)}</Text>
            </View>
          )}
          {!failure?.refresh && (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: run.isPending }}
              disabled={run.isPending}
              onPress={confirm}
              style={({ pressed: isPressed }) => [
                styles.primary,
                destructive && styles.primaryDanger,
                run.isPending && styles.disabled,
                isPressed && pressed,
              ]}
            >
              <Text style={styles.primaryText}>
                {run.isPending
                  ? t('connections.confirm.working')
                  : t(`connections.confirm.${action}.submit`)}
              </Text>
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed: isPressed }) => [styles.secondary, isPressed && pressed]}
          >
            <Text style={styles.secondaryText}>{t('connections.confirm.cancel')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.35)' },
  sheet: {
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
  eyebrowDanger: { color: DANGER },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  points: {
    gap: space.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    padding: space.lg,
  },
  pointsWarn: { backgroundColor: AMBER_BG, borderColor: '#fde68a' }, // amber-200
  point: { flexDirection: 'row', gap: space.sm },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 7, backgroundColor: '#94a3b8' },
  dotWarn: { backgroundColor: '#f59e0b' }, // amber-500
  pointText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.textMuted },
  pointTextWarn: { color: AMBER_FG },
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
  primaryDanger: { backgroundColor: DANGER },
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
