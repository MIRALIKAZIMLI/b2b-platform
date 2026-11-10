// Oturum açılınca push anahtarını kaydeder (F1.14-AC4); oturum kapanınca dinleyiciyi kaldırır.
// F2.13b: bildirime dokununca ilgili ekran açılır (`PushTapRouter`).
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { createPushRegistration } from '../../lib/push';
import { expoPushDevice } from '../../lib/push-device';
import { mobileApi, useMe, useSession } from '../../lib/session';
import { mobileAreaOf, pushHref } from './shell-state';
import { useActiveBusinessId } from './use-shell';

let registration: ReturnType<typeof createPushRegistration> | undefined;

export function PushRegistrar() {
  const session = useSession();
  const signedIn = session.data === true;
  useEffect(() => {
    if (!signedIn) return;
    registration ??= createPushRegistration(mobileApi().client, expoPushDevice);
    void registration.start();
    return () => {
      registration?.stop();
    };
  }, [signedIn]);
  return null;
}

/**
 * Push dokunuşu → ilgili ekran (F2.13b-AC7). Uygulama bildirimle açıldıysa `/me` gelene kadar
 * dokunuş bekletilir; alan seçili işletmeyle eşleşmezse yalnız uygulama açık kalır.
 */
export function PushTapRouter() {
  const router = useRouter();
  const session = useSession();
  const signedIn = session.data === true;
  const active = useActiveBusinessId();
  const me = useMe(signedIn, active);
  const [tapped, setTapped] = useState<{ readonly data: unknown } | undefined>();

  useEffect(() => {
    const subscription = expoPushDevice.onTap((data) => {
      setTapped({ data });
    });
    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (tapped === undefined || !signedIn || me.data === undefined) return;
    const result = mobileAreaOf(me.data);
    const href = pushHref(tapped.data, result.kind === 'area' ? result.area : undefined);
    setTapped(undefined);
    if (href !== undefined) router.push(href);
  }, [tapped, signedIn, me.data, router]);
  return null;
}
