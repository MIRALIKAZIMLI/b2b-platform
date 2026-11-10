// Bağlantı isteği gönderme sayfası — mobil (F2.12b; US-021). UX kararları:
// - Alttan açılan sayfa: başlıkta perakendecinin ünvanı; mesaj (çok satırlı, ≤500 sayaçlı) ve
//   önerilen vade (sayı klavyesi, 0–180) isteğe bağlı; tek ana düğme "Sorğunu göndər" (≥48 pt).
// - Klavye açıkken sayfa yukarı kayar (KeyboardAvoidingView); arka plana dokunmak kapatır.
// - `Idempotency-Key` sayfa açılınca bir kez; zayıf ağda yeniden denemede aynı kalır.
// - Hata sayfada, düğmenin üstünde (409 dört kod + bitiş tarihi, 429 saat/dakika, 403, 404).
// - Başarıda sayfa onay görünümüne geçer: "Sorğulara bax" (istekler ekranı) veya "Bağla".
import {
  CONNECTION_REQUEST_MESSAGE_MAX,
  CONNECTION_REQUEST_TERM_MAX_DAYS,
  connectionFailureMessage,
  connectionRequestFailure,
  createIdempotencyKey,
  parseTermDays,
} from '@b2b/shared';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, pressed, radius, softShadow, space, touchTarget } from '../../lib/theme';
import { ConnectionRequestError } from './api';
import { useConnectionContext, useSendConnectionRequest } from './queries';

export function SendSheet({
  buyerId,
  buyerName,
  onClose,
}: {
  readonly buyerId: string;
  readonly buyerName: string;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { businessId, formatDay } = useConnectionContext();
  const send = useSendConnectionRequest(businessId);
  const key = useRef(createIdempotencyKey('conn'));
  const [message, setMessage] = useState('');
  const [term, setTerm] = useState('');
  const [termInvalid, setTermInvalid] = useState(false);

  function submit() {
    const days = parseTermDays(term);
    setTermInvalid(days === 'invalid');
    if (days === 'invalid' || send.isPending) return;
    const trimmed = message.trim();
    send.mutate({
      key: key.current,
      body: {
        buyerId,
        ...(trimmed === '' ? {} : { message: trimmed }),
        ...(days === undefined ? {} : { proposedPaymentTermDays: days }),
      },
    });
  }

  let failureText: string | undefined;
  if (send.error !== null) {
    const view = connectionFailureMessage(
      connectionRequestFailure(
        send.error instanceof ConnectionRequestError ? send.error.body : undefined,
      ),
    );
    failureText = t(view.key, {
      ...(view.hours === undefined ? {} : { hours: view.hours }),
      ...(view.minutes === undefined ? {} : { minutes: view.minutes }),
      ...(view.until === undefined ? {} : { date: formatDay(view.until) }),
    });
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityLabel={t('connections.send.close')}
        />
        <View style={styles.sheet}>
          {send.isSuccess ? (
            <>
              <View style={styles.successIcon}>
                <Text style={styles.successMark}>✓</Text>
              </View>
              <Text style={styles.title} accessibilityRole="header">
                {t('connections.send.success_title')}
              </Text>
              <Text style={styles.body}>
                {t('connections.send.success_body', { name: buyerName })}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  onClose();
                  router.push('/requests');
                }}
                style={({ pressed: isPressed }) => [styles.primary, isPressed && pressed]}
              >
                <Text style={styles.primaryText}>{t('connections.send.go_requests')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={onClose}
                style={({ pressed: isPressed }) => [styles.secondary, isPressed && pressed]}
              >
                <Text style={styles.secondaryText}>{t('connections.send.close')}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.eyebrow}>{t('connections.send.title')}</Text>
              <Text style={styles.title} accessibilityRole="header" numberOfLines={3}>
                {buyerName}
              </Text>
              <Text style={styles.body}>
                {t('connections.send.description', { name: buyerName })}
              </Text>
              <View style={styles.field}>
                <Text style={styles.label}>{t('connections.send.message')}</Text>
                <TextInput
                  value={message}
                  onChangeText={setMessage}
                  multiline
                  maxLength={CONNECTION_REQUEST_MESSAGE_MAX}
                  placeholder={t('connections.send.message_placeholder')}
                  placeholderTextColor={colors.textSubtle}
                  accessibilityLabel={t('connections.send.message')}
                  style={[styles.input, styles.multiline]}
                  testID="connection-message"
                />
                <Text style={styles.hint}>
                  {t('connections.send.message_count', {
                    count: message.length,
                    max: CONNECTION_REQUEST_MESSAGE_MAX,
                  })}
                </Text>
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>{t('connections.send.term')}</Text>
                <TextInput
                  value={term}
                  onChangeText={(value) => {
                    setTerm(value);
                    setTermInvalid(false);
                  }}
                  keyboardType="number-pad"
                  maxLength={3}
                  accessibilityLabel={t('connections.send.term')}
                  style={[styles.input, styles.termInput, termInvalid && styles.inputInvalid]}
                  testID="connection-term"
                />
                <Text
                  style={termInvalid ? styles.error : styles.hint}
                  accessibilityLiveRegion="polite"
                >
                  {termInvalid
                    ? t('connections.send.term_invalid', { max: CONNECTION_REQUEST_TERM_MAX_DAYS })
                    : t('connections.send.term_hint', { max: CONNECTION_REQUEST_TERM_MAX_DAYS })}
                </Text>
              </View>
              {failureText !== undefined && (
                <View style={styles.errorBox} accessibilityRole="alert">
                  <Text style={styles.error}>{failureText}</Text>
                </View>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: send.isPending }}
                disabled={send.isPending}
                onPress={submit}
                style={({ pressed: isPressed }) => [
                  styles.primary,
                  send.isPending && styles.disabled,
                  isPressed && pressed,
                ]}
              >
                <Text style={styles.primaryText}>
                  {send.isPending ? t('connections.send.sending') : t('connections.send.submit')}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
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
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  body: { fontSize: 14, lineHeight: 20, color: colors.textMuted },
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
  multiline: { minHeight: 96, paddingTop: space.md, textAlignVertical: 'top' },
  termInput: { width: 120, fontVariant: ['tabular-nums'] },
  inputInvalid: { borderColor: colors.danger },
  hint: { fontSize: 12, color: colors.textMuted },
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
  successIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: '#ecfdf5', // emerald-50
    alignItems: 'center',
    justifyContent: 'center',
  },
  successMark: { color: '#059669', fontSize: 22, fontWeight: '700' }, // emerald-600
});
