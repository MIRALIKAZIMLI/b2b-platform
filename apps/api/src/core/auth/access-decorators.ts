// Uç nokta erişim işaretleri (F1.8b, ADR-0004, AGENTS kural 2). Her controller metodu bunlardan
// tam birini taşır (lint: b2b/require-endpoint-access). Dekoratörler yalnızca metadata yazar; kararı
// global AccessGuard (modules/access) verir. Burada (core) durur ki her modül kullanabilsin
// (access → identity bağımlılık yönü tersine dönmesin).
//
// Varsayılan reddet: hiçbir işareti olmayan uç giriş yapmış kullanıcıya bile 403 döner.
import { SetMetadata } from '@nestjs/common';
import type { PermissionCode, PlatformRole } from '@b2b/shared';

export const ACCESS_METADATA = 'b2b:access';

export type AccessRule =
  | { readonly kind: 'public' }
  | { readonly kind: 'authenticated' }
  | { readonly kind: 'permission'; readonly code: PermissionCode }
  | { readonly kind: 'platform'; readonly roles: readonly PlatformRole[] };

/** Kimliksiz erişim (sağlık, çeviriler, OTP isteği…). JWT bakılmaz. */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(ACCESS_METADATA, { kind: 'public' } satisfies AccessRule);

/** Yalnızca giriş: geçerli erişim anahtarı yeter; işletme bağlamı yok (`/me`, oturumlar). */
export const Authenticated = (): MethodDecorator & ClassDecorator =>
  SetMetadata(ACCESS_METADATA, { kind: 'authenticated' } satisfies AccessRule);

/**
 * İşletme bağlamlı uç: `X-Business-Id` + aktif üyelik + işletme durumu + yetenek + izin.
 * Bağlam `@CurrentTenant()` ile okunur.
 */
export const RequirePermission = (code: PermissionCode): MethodDecorator & ClassDecorator =>
  SetMetadata(ACCESS_METADATA, { kind: 'permission', code } satisfies AccessRule);

/** Platform uç noktası: aktif platform rolü bu listede olmalı (c4 §5). */
export const RequirePlatformRole = (
  ...roles: [PlatformRole, ...PlatformRole[]]
): MethodDecorator & ClassDecorator =>
  SetMetadata(ACCESS_METADATA, { kind: 'platform', roles } satisfies AccessRule);
