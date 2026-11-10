// Bağlantı iptali sayfası — mobil (F2.15b; US-025 AC1, SF-07). UX kararları (web penceresiyle aynı):
// - Alttan açılan sayfa: gül rengi üst satır, başlıkta toptancının ünvanı, 3 madde (geri alınamaz;
//   30 günlük bekleme; karşı tarafa bildirim, gerekçe görünmez).
// - Gerekçe dört büyük dokunma satırı (zorunlu), isteğe bağlı not (≤500), ikinci onay anahtarı
//   (Switch); onaysız "Ləğv et" kapalı. Ana düğme ≥48 pt, gül rengi.
// - `Idempotency-Key` sayfa açılınca bir kez; hata sayfada; bağlantı artık aktif değilse ana
//   düğme kalkar ve liste yenilenir. Başarıda sayfa kapanır.
import {
  CONNECTION_CANCEL_NOTE_MAX,
  CONNECTION_CANCEL_REASONS,
  type CancelFormState,
  cancelBody,
  cancelFailure,
  createIdempotencyKey,
  EMPTY_CANCEL_FORM,
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
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, pressed, radius, softShadow, space, touchTarget } from '../../lib/theme';
import { ConnectionRequestError } from '../connection-requests/api';
import { useCancelConnection } from './queries';

const ROSE_BORDER = '#fecdd3'; // rose-200

export function CancelSheet({
  businessId,
  connectionId,
  name,
  onClose,
}: {
  readonly businessId: string | undefined;
  readonly connectionId: string;
  readonly name: string;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation();
  const run = useCancelConnection(businessId);
  const key = useRef(createIdempotencyKey('cancel'));
  const [form, setForm] = useState<CancelFormState>(EMPTY_CANCEL_FORM);
  const body = cancelBody(form);
  const failure =
    run.error === null
      ? undefined
      : cancelFailure(run.error instanceof ConnectionRequestError ? run.error.body : undefined);

  function submit() {
    if (run.isPending || body === undefined) return;
    run.mutate({ id: connectionId, body, key: key.current }, { onSuccess: onClose });
  }

  const disabled = run.isPending || body === undefined;
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityLabel={t('connections.cancel.close')}
        />
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.eyebrow}>{t('connections.cancel.eyebrow')}</Text>
            <Text style={styles.title} accessibilityRole="header" numberOfLines={3}>
              {t('connections.cancel.title', { name })}
            </Text>
            <View style={styles.points}>
              {(['point_1', 'point_2_buyer', 'point_3'] as const).map((point) => (
                <View key={point} style={styles.point}>
                  <View style={styles.dot} />
                  <Text style={styles.pointText}>{t(`connections.cancel.${point}`, { name })}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.label}>{t('connections.cancel.reason_label')}</Text>
            <View style={styles.reasons} accessibilityRole="radiogroup">
              {CONNECTION_CANCEL_REASONS.map((reason) => {
                const selected = form.reason === reason;
                return (
                  <Pressable
                    key={reason}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      setForm((prev) => ({ ...prev, reason }));
                    }}
                    style={({ pressed: isPressed }) => [
                      styles.reason,
                      selected && styles.reasonSelected,
                      isPressed && pressed,
                    ]}
                  >
                    <View style={[styles.radio, selected && styles.radioSelected]}>
                      {selected && <View style={styles.radioDot} />}
                    </View>
                    <Text style={[styles.reasonText, selected && styles.reasonTextSelected]}>
                      {t(`connections.cancel.reason.${reason}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.label}>{t('connections.cancel.note_label')}</Text>
            <TextInput
              multiline
              maxLength={CONNECTION_CANCEL_NOTE_MAX}
              value={form.note}
              placeholder={t('connections.cancel.note_placeholder')}
              placeholderTextColor={colors.textSubtle}
              onChangeText={(note) => {
                setForm((prev) => ({ ...prev, note }));
              }}
              style={styles.note}
            />
            <Text style={styles.hint}>{t('connections.cancel.note_hint')}</Text>
            <View style={styles.confirm}>
              <Text style={styles.confirmText}>
                {t('connections.cancel.confirm_label', { name })}
              </Text>
              <Switch
                accessibilityLabel={t('connections.cancel.confirm_label', { name })}
                value={form.confirmed}
                onValueChange={(confirmed) => {
                  setForm((prev) => ({ ...prev, confirmed }));
                }}
                trackColor={{ true: colors.danger, false: colors.borderStrong }}
              />
            </View>
            {failure !== undefined && (
              <View style={styles.errorBox} accessibilityRole="alert">
                <Text style={styles.error}>{t(failure.key)}</Text>
              </View>
            )}
            {!failure?.refresh && (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled }}
                disabled={disabled}
                onPress={submit}
                style={({ pressed: isPressed }) => [
                  styles.primary,
                  disabled && styles.disabled,
                  isPressed && pressed,
                ]}
              >
                <Text style={styles.primaryText}>
                  {run.isPending ? t('connections.cancel.working') : t('connections.cancel.submit')}
                </Text>
              </Pressable>
            )}
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed: isPressed }) => [styles.secondary, isPressed && pressed]}
            >
              <Text style={styles.secondaryText}>{t('connections.cancel.close')}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.35)' },
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
    color: colors.danger,
  },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  points: {
    gap: space.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    padding: space.lg,
  },
  point: { flexDirection: 'row', gap: space.sm },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 7, backgroundColor: '#94a3b8' },
  pointText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.textMuted },
  label: { fontSize: 14, fontWeight: '600', color: colors.text, marginTop: space.sm },
  reasons: { gap: space.sm },
  reason: {
    minHeight: touchTarget + 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: space.lg,
  },
  reasonSelected: { borderColor: ROSE_BORDER, backgroundColor: colors.dangerSoft },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: colors.danger },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger },
  reasonText: { flex: 1, fontSize: 15, color: colors.text },
  reasonTextSelected: { fontWeight: '600', color: '#9f1239' }, // rose-800
  note: {
    minHeight: 88,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: space.md,
    fontSize: 15,
    color: colors.text,
    textAlignVertical: 'top',
  },
  hint: { fontSize: 12, color: colors.textMuted },
  confirm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: ROSE_BORDER,
    backgroundColor: colors.dangerSoft,
    padding: space.lg,
  },
  confirmText: { flex: 1, fontSize: 14, lineHeight: 20, color: '#881337' }, // rose-900
  error: { fontSize: 13, color: colors.danger, fontWeight: '500' },
  errorBox: { backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: space.md },
  primary: {
    minHeight: touchTarget + 4,
    borderRadius: radius.lg,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    marginTop: space.sm,
    ...softShadow(2),
  },
  disabled: { opacity: 0.5 },
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
