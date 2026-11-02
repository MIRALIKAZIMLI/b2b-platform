// Ekip daveti kabulü (F2.7b, US-013 AC1; F2.7 K6). Deep link `b2b://activate?token=` bu ekranı
// açar. UX kararları: tek kart; oturum yoksa açıklama + tam genişlik Indigo "Daxil ol" düğmesi
// (giriş bitince açılış ekranı buraya döner, token yalnız bellekte); oturum varsa kabul kendiliğinden
// başlar ve gösterge döner; başarıda işletme seçilir, son kullanılan yazılır, açılış ekranı alana
// yönlendirir. Her başarısız kabul aynı `404` → tek açıklayıcı mesaj; ağ hatasında "Yeniden dene"
// ve ana sayfaya dönüş (F2.7c, Müfettiş #49 L3; dönüşte bekleyen davet bırakılır).
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ME_KEY,
  mobileApi,
  setActiveBusinessId,
  useRememberBusiness,
  useSession,
} from '../../lib/session';
import { colors, pressed, radius, softShadow, space, touchTarget } from '../../lib/theme';
import {
  capturePendingInvitation,
  clearPendingInvitation,
  pendingInvitation,
} from './pending-invitation';

type Phase = 'ready' | 'accepting' | 'invalid' | 'failed';

export function ActivateScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useSession();
  const remember = useRememberBusiness();
  const params = useLocalSearchParams<{ token?: string }>();
  const accepting = useRef(false);
  const [phase, setPhase] = useState<Phase>(() => {
    capturePendingInvitation(params.token);
    return pendingInvitation() === undefined ? 'invalid' : 'ready';
  });

  const accept = useCallback(async () => {
    const token = pendingInvitation();
    if (token === undefined || accepting.current) return;
    accepting.current = true;
    setPhase('accepting');
    try {
      const { data, response } = await mobileApi().client.POST('/api/v1/team/invitations/accept', {
        body: { token },
      });
      if (data === undefined) {
        if (response.status === 404) {
          clearPendingInvitation();
          setPhase('invalid');
        } else {
          setPhase('failed');
        }
        return;
      }
      clearPendingInvitation();
      setActiveBusinessId(data.businessId);
      remember.mutate(data.businessId);
      await queryClient.invalidateQueries({ queryKey: ME_KEY });
      router.replace('/');
    } catch (failure: unknown) {
      // Ağ hatası: token bellekte kalır, kullanıcı yeniden dener.
      if (!(failure instanceof Error)) throw failure;
      setPhase('failed');
    } finally {
      accepting.current = false;
    }
  }, [queryClient, remember, router]);

  useEffect(() => {
    if (phase === 'ready' && session.data === true) void accept();
  }, [phase, session.data, accept]);

  const signedOut = phase === 'ready' && session.data === false;
  const busy = phase === 'accepting' || (phase === 'ready' && session.data !== false);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>
            {t('activate.title')}
          </Text>
          {phase !== 'invalid' && <Text style={styles.body}>{t('activate.team_intro')}</Text>}
          {busy && (
            <View style={styles.row} accessibilityLiveRegion="polite">
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.body}>{t('activate.accepting')}</Text>
            </View>
          )}
          {signedOut && (
            <Pressable
              accessibilityRole="button"
              testID="activate-sign-in"
              onPress={() => {
                router.push('/phone');
              }}
              style={({ pressed: isPressed }) => [styles.primary, isPressed && pressed]}
            >
              <Text style={styles.primaryText}>{t('activate.sign_in')}</Text>
            </Pressable>
          )}
          {phase === 'invalid' && (
            <>
              <Text accessibilityRole="alert" style={styles.error}>
                {t('activate.invalid')}
              </Text>
              <Text style={styles.body}>{t('activate.team_invalid_hint')}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  router.replace('/');
                }}
                style={({ pressed: isPressed }) => [styles.secondary, isPressed && pressed]}
              >
                <Text style={styles.secondaryText}>{t('activate.go_home')}</Text>
              </Pressable>
            </>
          )}
          {phase === 'failed' && (
            <>
              <Text accessibilityRole="alert" style={styles.error}>
                {t('errors.INTERNAL_ERROR')}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setPhase('ready');
                }}
                style={({ pressed: isPressed }) => [styles.secondary, isPressed && pressed]}
              >
                <Text style={styles.secondaryText}>{t('activate.retry')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  // Bekleyen davet bırakılır; yoksa açılış ekranı yine buraya döner.
                  clearPendingInvitation();
                  router.replace('/');
                }}
                style={({ pressed: isPressed }) => [styles.secondary, isPressed && pressed]}
              >
                <Text style={styles.secondaryText}>{t('activate.go_home')}</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', padding: space.xl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.xl,
    gap: space.lg,
    ...softShadow(2),
  },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  body: { fontSize: 15, lineHeight: 22, color: colors.textMuted },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  error: { fontSize: 15, fontWeight: '600', color: colors.danger },
  primary: {
    minHeight: touchTarget + 8,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...softShadow(2),
  },
  primaryText: { color: colors.onAccent, fontSize: 16, fontWeight: '700' },
  secondary: {
    minHeight: touchTarget,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { fontSize: 15, fontWeight: '600', color: colors.text },
});
