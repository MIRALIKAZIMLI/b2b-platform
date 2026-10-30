// Kabuk alanı ve açılış adresi (F1.13b). Saf fonksiyonlar; `/me` yanıtından karar verir.
import type { components } from '@b2b/api-client';
import type { ShellArea } from './menu';

type Me = components['schemas']['Me'];
type Membership = components['schemas']['MembershipSummary'];

/** Varsayılan işletme: ilk aktif üyelik, yoksa ilk üyelik (askıdaki işletme listede kalır). */
export function defaultBusinessId(memberships: readonly Membership[]): string | undefined {
  const active = memberships.find((item) => item.businessStatus === 'active');
  return (active ?? memberships[0])?.businessId;
}

/**
 * Kullanıcının alanı: seçili işletmenin yeteneği (`activeBusiness.capability`); işletme yoksa
 * platform rolü → `admin`. Hiçbiri yoksa `undefined` (ana sayfada bilgi mesajı).
 */
export function areaOf(me: Me): ShellArea | undefined {
  const capability = me.activeBusiness?.capability;
  if (capability === 'seller' || capability === 'buyer') return capability;
  const platformRole = me.platformRole ?? null;
  return platformRole === null ? undefined : 'admin';
}

/** Alanın açılış sayfası (dashboard): `/<dil>/<alan>`. */
export function landingPath(locale: string, area: ShellArea): string {
  return `/${locale}/${area}`;
}
