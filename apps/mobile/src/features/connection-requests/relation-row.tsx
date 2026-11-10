// Dizin kartının ilişki satırı — mobil (F2.12b; US-021 AC4–AC5). Durum renkli nokta + metin;
// "Bağlantı sorğusu göndər" yalnız `canRequest` ve `connections.request.send` izniyle.
import { type ConnectionRelation, relationView } from '@b2b/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, pressed, radius, softShadow, space, touchTarget } from '../../lib/theme';
import { useConnectionContext } from './queries';
import { SendSheet } from './send-sheet';

const DOT = { pending: '#f59e0b', active: colors.success, muted: '#94a3b8' } as const;

export function RelationRow({
  buyerId,
  buyerName,
  relation,
}: {
  readonly buyerId: string;
  readonly buyerName: string;
  readonly relation: ConnectionRelation;
}) {
  const { t } = useTranslation();
  const { canSend, formatDay } = useConnectionContext();
  const [open, setOpen] = useState(false);
  const view = relationView(relation);
  const status: { tone: keyof typeof DOT; text: string } | undefined =
    view.kind === 'pending'
      ? { tone: 'pending', text: t('connections.relation.pending') }
      : view.kind === 'active'
        ? { tone: 'active', text: t('connections.relation.active') }
        : view.kind === 'blocked'
          ? { tone: 'muted', text: t('connections.relation.blocked') }
          : view.kind === 'cooldown'
            ? {
                tone: 'muted',
                text: t('connections.relation.cooldown', { date: formatDay(view.until) }),
              }
            : view.kind === 'unavailable'
              ? { tone: 'muted', text: t('connections.relation.unavailable') }
              : undefined;

  if (status === undefined && !(view.kind === 'send' && canSend)) return null;
  return (
    <View style={styles.wrap}>
      {status !== undefined && (
        <View style={styles.status}>
          <View style={[styles.dot, { backgroundColor: DOT[status.tone] }]} />
          <Text style={styles.statusText}>{status.text}</Text>
        </View>
      )}
      {view.kind === 'send' && canSend && (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setOpen(true);
          }}
          style={({ pressed: isPressed }) => [styles.primary, isPressed && pressed]}
          testID={`connection-send-${buyerId}`}
        >
          <Text style={styles.primaryText}>{t('connections.send.open')}</Text>
        </Pressable>
      )}
      {open && (
        <SendSheet
          buyerId={buyerId}
          buyerName={buyerName}
          onClose={() => {
            setOpen(false);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: 1,
    borderTopColor: colors.surfaceMuted,
    paddingTop: space.md,
    gap: space.md,
  },
  status: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 24 },
  dot: { width: 8, height: 8, borderRadius: radius.pill },
  statusText: { flex: 1, fontSize: 14, fontWeight: '500', color: colors.text },
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
});
