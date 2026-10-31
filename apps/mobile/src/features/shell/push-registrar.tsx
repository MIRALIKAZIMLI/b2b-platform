// Oturum açılınca push anahtarını kaydeder (F1.14-AC4); oturum kapanınca dinleyiciyi kaldırır.
import { useEffect } from 'react';
import { createPushRegistration } from '../../lib/push';
import { expoPushDevice } from '../../lib/push-device';
import { mobileApi, useSession } from '../../lib/session';

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
