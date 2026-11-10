// `PushDevice`'ın gerçek uygulaması (expo-notifications, expo-constants). `expo-notifications`
// yalnızca gerektiğinde yüklenir: Android Expo Go'da modül push desteği vermez (F1.14b).
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import type { PushDevice } from './push';

type Notifications = typeof import('expo-notifications');

let module: Promise<Notifications> | undefined;
const notifications = (): Promise<Notifications> => (module ??= import('expo-notifications'));

function easProjectId(): string | undefined {
  // Expo Go'da (`storeClient`) uzaktan push yok; anahtar alınmaya çalışılmaz.
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return undefined;
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined;
  const id = extra?.eas?.projectId;
  return typeof id === 'string' && id !== '' ? id : undefined;
}

export const expoPushDevice: PushDevice = {
  platform: Platform.OS === 'ios' ? 'ios' : 'android',
  projectId: easProjectId,
  async ensurePermission() {
    const api = await notifications();
    if (Platform.OS === 'android') {
      // Android 13+: izin istenmeden önce bir bildirim kanalı olmalı.
      await api.setNotificationChannelAsync('default', {
        name: 'default',
        importance: api.AndroidImportance.DEFAULT,
      });
    }
    const current = await api.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    return (await api.requestPermissionsAsync()).granted;
  },
  async getExpoToken(projectId) {
    const api = await notifications();
    return (await api.getExpoPushTokenAsync({ projectId })).data;
  },
  onTokenChange(listener) {
    let removed = false;
    let inner: { remove(): void } | undefined;
    void notifications().then((api) => {
      if (!removed)
        inner = api.addPushTokenListener(() => {
          listener();
        });
    });
    return {
      remove() {
        removed = true;
        inner?.remove();
      },
    };
  },
  onTap(listener) {
    let removed = false;
    let inner: { remove(): void } | undefined;
    notifications()
      .then((api) => {
        if (removed) return;
        inner = api.addNotificationResponseReceivedListener((response) => {
          listener(response.notification.request.content.data);
        });
        const last = api.getLastNotificationResponse();
        if (last !== null) {
          listener(last.notification.request.content.data);
          api.clearLastNotificationResponse();
        }
      })
      .catch(() => {
        // Modül yüklenemezse (push desteği olmayan ortam) dokunuş yönlendirmesi olmadan devam
        // edilir; uygulama açılır, yalnız ilgili ekrana gidilmez.
      });
    return {
      remove() {
        removed = true;
        inner?.remove();
      },
    };
  },
};
