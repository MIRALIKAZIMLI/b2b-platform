// `(seller)` ve `(buyer)` düzenlerinin ortak kısmı: oturum yoksa giriş; alan seçili işletmenin
// yeteneğiyle uyuşmuyorsa açılışa (`/`) dönülür. Asıl kontrol API'de.
import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { ShellScreen } from './shell-screen';
import { type MobileArea, mobileAreaOf } from './shell-state';
import { shellStyles } from './shell-styles';
import { useShell } from './use-shell';

export function AreaHome({ area }: { readonly area: MobileArea }) {
  const shell = useShell();
  if (shell.sessionLoading || (shell.hasSession && shell.me === undefined)) {
    return (
      <View style={shellStyles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  if (!shell.hasSession || shell.me === undefined) return <Redirect href="/" />;
  const result = mobileAreaOf(shell.me);
  if (result.kind !== 'area' || result.area !== area) return <Redirect href="/" />;
  return <ShellScreen me={shell.me} area={area} activeBusinessId={shell.activeBusinessId} />;
}
