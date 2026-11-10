// Mobil kabuk kararları (F1.14b). Saf fonksiyonlar; ekranlar yalnızca sonucu çizer.
// Web (F1.13b `landing.ts`) ile aynı kural: alan = seçili işletmenin yeteneği. Mobilde platform
// paneli yok (productreport "Toptancı — Mobil", "Perakendeci — Mobil"); yalnız platform rolü olan
// kullanıcıya "web'den girin" bilgisi gösterilir.
import type { components } from '@b2b/api-client';
import { initialBusinessId, type MenuItem, visibleMenu } from '@b2b/shared';
import type { UpdateDecision } from '../../lib/app-config';

type Me = components['schemas']['Me'];
type Membership = components['schemas']['MembershipSummary'];

export type MobileArea = 'seller' | 'buyer';

/**
 * Varsayılan işletme (US-003 AC1): son kullanılan (`/me.lastBusinessId`, S8) üyelikler arasındaysa
 * o; değilse ilk aktif üyelik, yoksa ilk üyelik. Kural web ile ortak (`@b2b/shared`).
 */
export function defaultBusinessId(
  memberships: readonly Membership[],
  lastBusinessId: string | null = null,
): string | undefined {
  return initialBusinessId(memberships, lastBusinessId);
}

export type AreaResult =
  | { readonly kind: 'area'; readonly area: MobileArea }
  | { readonly kind: 'platform_only' }
  | { readonly kind: 'none' };

export function mobileAreaOf(me: Pick<Me, 'activeBusiness' | 'platformRole'>): AreaResult {
  const capability = me.activeBusiness?.capability;
  if (capability === 'seller' || capability === 'buyer') return { kind: 'area', area: capability };
  const platformRole = me.platformRole ?? null;
  return platformRole === null ? { kind: 'none' } : { kind: 'platform_only' };
}

/** F1.14-AC5: menü seçili işletmedeki izinlerden (`/me` → `activeBusiness.permissions`). */
export function mobileMenu(me: Pick<Me, 'activeBusiness'>, area: MobileArea): MenuItem[] {
  const codes = (me.activeBusiness?.permissions ?? []).map((item) => item.code);
  return visibleMenu(area, codes);
}

/**
 * Hazır menü öğesinin mobil adresi (expo-router; grup adı adreste yoktur). Yalnız mobilde ekranı
 * olan öğeler; diğerleri bağlantısız kalır. F2.4: perakendeci profili. F2.11b: dizin. F2.12b: istekler.
 */
type MobileRoute = '/business-profile' | '/directory' | '/requests';

const MOBILE_ROUTES: Readonly<Record<string, MobileRoute>> = {
  'buyer:profile': '/business-profile',
  // F2.11b: satış temsilcisi perakendeci dizini (US-019, US-020).
  'seller:directory': '/directory',
  // F2.12b: gönderilen bağlantı istekleri (US-021).
  'seller:requests': '/requests',
};

export function mobileHref(area: MobileArea, item: MenuItem): MobileRoute | undefined {
  return item.ready ? MOBILE_ROUTES[`${area}:${item.key}`] : undefined;
}

export type SessionState = 'pending' | 'error' | 'signed_in' | 'signed_out';

export type StartupScreen =
  | { readonly kind: 'loading' }
  | { readonly kind: 'update_required'; readonly storeUrl?: string }
  | { readonly kind: 'offline' }
  | { readonly kind: 'login' }
  | { readonly kind: 'home' };

/**
 * Açılış ekranı. Zorunlu güncelleme her şeyden önce (US-060 AC1). Oturum geri alınırken ağ
 * hatası (`error`: 5xx / bağlantı yok) giriş ekranına değil "Yeniden dene"ye gider; anahtar
 * cihazda kalır (Müfettiş #33 L1).
 */
export function startupScreen(
  update: UpdateDecision | 'pending',
  session: SessionState,
): StartupScreen {
  if (update === 'pending') return { kind: 'loading' };
  if (update.kind === 'required') {
    return update.storeUrl === undefined
      ? { kind: 'update_required' }
      : { kind: 'update_required', storeUrl: update.storeUrl };
  }
  switch (session) {
    case 'pending':
      return { kind: 'loading' };
    case 'error':
      return { kind: 'offline' };
    case 'signed_out':
      return { kind: 'login' };
    case 'signed_in':
      return { kind: 'home' };
  }
}
