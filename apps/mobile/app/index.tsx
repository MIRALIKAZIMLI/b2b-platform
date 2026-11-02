// Açılış (F1.14b): sürüm kontrolü → oturum → alan. Ağ yoksa "Yeniden dene" (Müfettiş #33 L1);
// oturum yoksa giriş; varsa seçili işletmenin yeteneğine göre `/seller` veya `/buyer`.
// F2.7b: deep link ile gelen ekip daveti girişten sonra bekliyorsa önce kabul ekranı.
import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { OfflineRetry } from '../src/features/shell/offline-retry';
import { NoAreaScreen } from '../src/features/shell/shell-screen';
import { type SessionState, mobileAreaOf, startupScreen } from '../src/features/shell/shell-state';
import { shellStyles } from '../src/features/shell/shell-styles';
import { useUpdateDecision } from '../src/features/shell/use-app-config';
import { useShell } from '../src/features/shell/use-shell';
import { UpdateRequired } from '../src/features/shell/update-required';
import { pendingInvitation } from '../src/features/team/pending-invitation';
import { useSession } from '../src/lib/session';

function sessionState(session: ReturnType<typeof useSession>): SessionState {
  if (session.isPending) return 'pending';
  if (session.isError) return 'error';
  return session.data ? 'signed_in' : 'signed_out';
}

function Loading() {
  return (
    <View style={shellStyles.center}>
      <ActivityIndicator />
    </View>
  );
}

function Home() {
  const shell = useShell();
  if (pendingInvitation() !== undefined) return <Redirect href="/activate" />;
  if (shell.me === undefined) return <Loading />;
  const result = mobileAreaOf(shell.me);
  if (result.kind === 'area')
    return <Redirect href={result.area === 'seller' ? '/seller' : '/buyer'} />;
  return (
    <NoAreaScreen
      messageKey={result.kind === 'platform_only' ? 'shell.platform_on_web' : 'shell.no_business'}
    />
  );
}

export default function StartScreen() {
  const update = useUpdateDecision();
  const session = useSession();
  const screen = startupScreen(update, sessionState(session));
  switch (screen.kind) {
    case 'loading':
      return <Loading />;
    case 'update_required':
      return (
        <UpdateRequired {...(screen.storeUrl === undefined ? {} : { storeUrl: screen.storeUrl })} />
      );
    case 'offline':
      return (
        <OfflineRetry
          busy={session.isFetching}
          onRetry={() => {
            void session.refetch();
          }}
        />
      );
    case 'login':
      return <Redirect href="/phone" />;
    case 'home':
      return <Home />;
  }
}
