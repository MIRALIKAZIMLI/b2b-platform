// Gelen bağlantı istekleri ve bloklananlar — mobil (F2.13b; US-023). UX kararları:
// - Başlık + iki çip sekme: "Gələn sorğular" / "Bloklananlar" (yalnız `connections.block`).
// - Her istek bir kart (rounded-3xl): logo ya da baş harf, ünvan, tanıtım (kullanıcı dili,
//   3 satır), mesaj alıntı kutusunda, vade + son tarih. Ürün/fiyat yok.
// - Eylemler kartın altında tam genişlik: "Qəbul et" (ana), yan yana "Rədd et" ve "Blokla";
//   her biri onay sayfası açar. İzin yoksa düğme yok (satın alma sorumlusu yalnız görür).
// - Bloklananlar kartlarda "Bloku götür" ile. Aşağı çekince yenilenir; liste sonunda sonraki sayfa.
import { incomingCardView, type IncomingCardView, initialsOf } from '@b2b/shared';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, pressed, radius, softShadow, space, touchTarget } from '../../lib/theme';
import { type ConfirmAction, ConnectionRequestError } from './api';
import { ConfirmSheet } from './confirm-sheet';
import { useBlocks, useConnectionContext, useIncomingRequests } from './queries';

type Tab = 'incoming' | 'blocked';

interface Pending {
  readonly action: ConfirmAction;
  readonly targetId: string;
  readonly name: string;
}

interface Row {
  readonly key: string;
  readonly name: string;
  readonly initials: string;
  readonly logoUrl: string | null;
  readonly incoming?: IncomingCardView;
  readonly blockedAt?: string;
}

function Avatar({
  initials,
  logoUrl,
}: {
  readonly initials: string;
  readonly logoUrl: string | null;
}) {
  return logoUrl === null ? (
    <View style={styles.avatar}>
      <Text style={styles.avatarText}>{initials}</Text>
    </View>
  ) : (
    <Image source={{ uri: logoUrl }} style={styles.avatarImage} accessibilityIgnoresInvertColors />
  );
}

function ActionButton({
  label,
  kind,
  onPress,
}: {
  readonly label: string;
  readonly kind: 'primary' | 'secondary' | 'danger';
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed: isPressed }) => [
        kind === 'primary' ? styles.primary : styles.secondary,
        kind !== 'primary' && styles.flex,
        isPressed && pressed,
      ]}
    >
      <Text
        style={
          kind === 'primary'
            ? styles.primaryText
            : [styles.secondaryText, kind === 'danger' && styles.dangerText]
        }
      >
        {label}
      </Text>
    </Pressable>
  );
}

function IncomingCard({
  view,
  onAction,
}: {
  readonly view: IncomingCardView;
  readonly onAction: (pending: Pending) => void;
}) {
  const { t } = useTranslation();
  const { formatDay, access } = useConnectionContext();
  const open = (action: ConfirmAction, targetId: string) => {
    onAction({ action, targetId, name: view.sellerName });
  };
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Avatar initials={view.initials} logoUrl={view.logoUrl} />
        <View style={styles.flex}>
          <Text style={styles.name} numberOfLines={2} accessibilityRole="header">
            {view.sellerName}
          </Text>
          <Text
            style={view.description === null ? styles.muted : styles.description}
            numberOfLines={3}
          >
            {view.description ?? t('connections.incoming.no_description')}
          </Text>
        </View>
      </View>
      {view.message !== null && (
        <View style={styles.quote}>
          <Text style={styles.quoteLabel}>{t('connections.incoming.message')}</Text>
          <Text style={styles.quoteText}>{view.message}</Text>
        </View>
      )}
      <View style={styles.metaRow}>
        <Text style={styles.meta}>
          {t('connections.incoming.term')}{' '}
          <Text style={styles.metaStrong}>
            {view.termDays === null
              ? t('connections.incoming.term_none')
              : t('connections.incoming.term_days', { days: view.termDays })}
          </Text>
        </Text>
        {view.expiresAt !== null && (
          <Text style={styles.meta}>
            {t('connections.incoming.expires')}{' '}
            <Text style={styles.metaStrong}>{formatDay(view.expiresAt)}</Text>
          </Text>
        )}
      </View>
      {access.respond && (
        <ActionButton
          kind="primary"
          label={t('connections.incoming.accept')}
          onPress={() => {
            open('accept', view.id);
          }}
        />
      )}
      {(access.respond || access.block) && (
        <View style={styles.actionRow}>
          {access.respond && (
            <ActionButton
              kind="secondary"
              label={t('connections.incoming.reject')}
              onPress={() => {
                open('reject', view.id);
              }}
            />
          )}
          {access.block && (
            <ActionButton
              kind="danger"
              label={t('connections.incoming.block')}
              onPress={() => {
                open('block', view.sellerId);
              }}
            />
          )}
        </View>
      )}
    </View>
  );
}

function BlockedCard({
  row,
  onAction,
}: {
  readonly row: Row;
  readonly onAction: (pending: Pending) => void;
}) {
  const { t } = useTranslation();
  const { formatDay } = useConnectionContext();
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Avatar initials={row.initials} logoUrl={row.logoUrl} />
        <View style={styles.flex}>
          <Text style={styles.name} numberOfLines={2}>
            {row.name}
          </Text>
          {row.blockedAt !== undefined && (
            <Text style={styles.meta}>
              {t('connections.blocked.since', { date: formatDay(row.blockedAt) })}
            </Text>
          )}
        </View>
      </View>
      <ActionButton
        kind="secondary"
        label={t('connections.blocked.unblock')}
        onPress={() => {
          onAction({ action: 'unblock', targetId: row.key, name: row.name });
        }}
      />
    </View>
  );
}

export function IncomingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { businessId, access, meLoaded, language } = useConnectionContext();
  const [tab, setTab] = useState<Tab>('incoming');
  const [pending, setPending] = useState<Pending | undefined>();
  const incoming = useIncomingRequests(access.view && tab === 'incoming' ? businessId : undefined);
  const blocks = useBlocks(access.block && tab === 'blocked' ? businessId : undefined);
  const list = tab === 'incoming' ? incoming : blocks;

  const rows = useMemo<Row[]>(() => {
    if (tab === 'blocked') {
      return (blocks.data?.items ?? []).map((item) => ({
        key: item.sellerId,
        name: item.sellerName,
        initials: initialsOf(item.sellerName),
        logoUrl: item.logoUrl,
        blockedAt: item.createdAt,
      }));
    }
    return (incoming.data?.pages.flatMap((page) => page.items) ?? []).map((item) => {
      const view = incomingCardView(item, language);
      return {
        key: view.id,
        name: view.sellerName,
        initials: view.initials,
        logoUrl: view.logoUrl,
        incoming: view,
      };
    });
  }, [tab, blocks.data, incoming.data, language]);

  const tabs: Tab[] = access.block ? ['incoming', 'blocked'] : ['incoming'];
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
        {t('connections.incoming.title')}
      </Text>
      <Text style={styles.meta}>{t('connections.incoming.description')}</Text>
      {tabs.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          accessibilityRole="tablist"
        >
          {tabs.map((key) => {
            const active = key === tab;
            return (
              <Pressable
                key={key}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  setTab(key);
                }}
                style={({ pressed: isPressed }) => [
                  styles.chip,
                  active && styles.chipActive,
                  isPressed && pressed,
                ]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {t(`connections.incoming.tab_${key}`)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );

  const empty =
    meLoaded && !access.view ? (
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
        <ActionButton
          kind="secondary"
          label={t('connections.outgoing.retry')}
          onPress={() => void list.refetch()}
        />
      </View>
    ) : list.isPending ? (
      <ActivityIndicator style={styles.loader} color={colors.accent} />
    ) : (
      <View style={styles.card}>
        <Text style={styles.name}>{t(`connections.${tab}.empty_title`)}</Text>
        <Text style={styles.meta}>{t(`connections.${tab}.empty`)}</Text>
      </View>
    );

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        renderItem={({ item }) =>
          item.incoming === undefined ? (
            <BlockedCard row={item} onAction={setPending} />
          ) : (
            <IncomingCard view={item.incoming} onAction={setPending} />
          )
        }
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={
          incoming.isFetchingNextPage ? (
            <ActivityIndicator style={styles.loader} color={colors.accent} />
          ) : undefined
        }
        contentContainerStyle={styles.list}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (tab === 'incoming' && incoming.hasNextPage && !incoming.isFetchingNextPage) {
            void incoming.fetchNextPage();
          }
        }}
        refreshing={list.isRefetching && !incoming.isFetchingNextPage}
        onRefresh={() => void list.refetch()}
      />
      {pending !== undefined && (
        <ConfirmSheet
          action={pending.action}
          targetId={pending.targetId}
          name={pending.name}
          onClose={() => {
            setPending(undefined);
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
  metaStrong: { color: colors.text, fontWeight: '600' },
  metaRow: { gap: space.xs },
  muted: { fontSize: 14, fontStyle: 'italic', color: colors.textSubtle },
  description: { fontSize: 14, lineHeight: 20, color: colors.textMuted },
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
    gap: space.md,
    ...softShadow(1),
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: '#eef2ff', // indigo-50
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 15, fontWeight: '700', color: '#4338ca' }, // indigo-700
  avatarImage: { width: 48, height: 48, borderRadius: radius.lg, backgroundColor: colors.surface },
  name: { fontSize: 17, fontWeight: '600', color: colors.text },
  quote: {
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
    padding: space.md,
    gap: space.xs,
  },
  quoteLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  quoteText: { fontSize: 14, lineHeight: 20, color: colors.text },
  actionRow: { flexDirection: 'row', gap: space.sm },
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
