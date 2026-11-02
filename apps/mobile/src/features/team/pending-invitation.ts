// Bekleyen ekip daveti (F2.7b, F2.7 K6): deep link `b2b://activate?token=` ile gelen token yalnız
// bellekte tutulur (cihaza yazılmaz, loga girmez; coding-guidelines §9.6). Oturum yoksa giriş
// ekranına gidilir; giriş bitince açılış ekranı bekleyen davet varsa kabul ekranına döner.
import { invitationToken } from '@b2b/shared';

let pending: string | undefined;

/** Deep link parametresini saklar; geçersizse önceki bekleyen davet korunur. Geçerliyse `true`. */
export function capturePendingInvitation(value: unknown): boolean {
  const token = invitationToken(value);
  if (token === undefined) return false;
  pending = token;
  return true;
}

export function pendingInvitation(): string | undefined {
  return pending;
}

/** Kabul bitti (başarılı veya geçersiz bağlantı): token bellekten silinir. */
export function clearPendingInvitation(): void {
  pending = undefined;
}
