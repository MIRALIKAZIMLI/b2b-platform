// Push anahtarı kaydı (F1.14-AC4, integrations §3). İzin → Expo push anahtarı
// (`ExponentPushToken[...]`) → `POST /api/v1/push-tokens`. Girişten sonra ve anahtar değişince.
// - Expo hesabındaki `projectId` yoksa veya uygulama Expo Go'da çalışıyorsa (Android Expo Go
//   SDK 53'ten beri uzaktan push vermez) kayıt atlanır; uygulama çalışmaya devam eder.
//   Gerçek cihazda push denemesi EAS derlemesiyle F6'da (kullanıcı kararı, 2026-10-31).
// - Anahtar hiçbir log veya hata mesajına yazılmaz (AGENTS.md kural 11).
import type { ApiClient } from '@b2b/api-client';
import type { AppPlatform } from './app-config';

export type PushResult = 'registered' | 'denied' | 'unavailable' | 'failed';

/** Yerel modüllere erişim; testte sahtesi verilir. */
export interface PushDevice {
  readonly platform: AppPlatform;
  /** Expo hesabı proje kimliği; yoksa veya Expo Go'daysa `undefined`. */
  projectId(): string | undefined;
  /** Mevcut izin; verilmemişse ve sorulabiliyorsa kullanıcıya sorulur. */
  ensurePermission(): Promise<boolean>;
  getExpoToken(projectId: string): Promise<string>;
  /** Cihaz anahtarı değişince çağrılır. */
  onTokenChange(listener: () => void): { remove(): void };
  /**
   * Kullanıcı bildirime dokununca `data` (`{ type, id }`) ile çağrılır; uygulama bildirimle
   * açıldıysa (soğuk başlangıç) son dokunuş da bir kez iletilir (F2.13b).
   */
  onTap(listener: (data: unknown) => void): { remove(): void };
}

export interface PushRegistration {
  /** Girişten sonra çağrılır; anahtar değişince kendini yeniden çalıştırır. */
  start(): Promise<PushResult>;
  /** Çıkışta: dinleyici kaldırılır. */
  stop(): void;
}

export function createPushRegistration(client: ApiClient, device: PushDevice): PushRegistration {
  let subscription: { remove(): void } | undefined;
  let lastSent: string | undefined;

  async function register(): Promise<PushResult> {
    const projectId = device.projectId();
    if (projectId === undefined) return 'unavailable';
    if (!(await device.ensurePermission())) return 'denied';
    let token: string;
    try {
      token = await device.getExpoToken(projectId);
    } catch {
      // Ayrıntı (anahtar parçası içerebilir) yutulur; push isteğe bağlıdır.
      return 'failed';
    }
    if (token === lastSent) return 'registered';
    const { response } = await client.POST('/api/v1/push-tokens', {
      body: { token, platform: device.platform },
    });
    if (!response.ok) return 'failed';
    lastSent = token;
    return 'registered';
  }

  async function safeRegister(): Promise<PushResult> {
    try {
      return await register();
    } catch {
      // Ağ hatası: sonraki açılışta / anahtar değişince yeniden denenir.
      return 'failed';
    }
  }

  return {
    async start() {
      const result = await safeRegister();
      if (result !== 'unavailable' && subscription === undefined) {
        subscription = device.onTokenChange(() => {
          void safeRegister();
        });
      }
      return result;
    },
    stop() {
      subscription?.remove();
      subscription = undefined;
      lastSent = undefined;
    },
  };
}

const NO_SUBSCRIPTION = { remove: () => undefined };

/**
 * Push dokunuşunu dinler (F2.13b-AC7; Müfettiş 18 M1). Kayıtla aynı kapı: `projectId` yoksa veya
 * Expo Go'daysa uzaktan push gelmez; `expo-notifications` hiç yüklenmez, boş abonelik döner.
 */
export function subscribePushTaps(
  device: PushDevice,
  listener: (data: unknown) => void,
): { remove(): void } {
  if (device.projectId() === undefined) return NO_SUBSCRIPTION;
  return device.onTap(listener);
}
