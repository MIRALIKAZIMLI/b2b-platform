// İsteğin kimliği doğrulanmış kullanıcısı. AccessTokenGuard (identity, F1.5b) `request.user`'ı
// doldurur; korumasız uçlarda testler doldurabilir. Değer uuid değilse kullanıcı yok sayılır.

export interface RequestUser {
  readonly id: string;
  /** Erişim anahtarındaki oturum (`sid`, F1.5b). */
  readonly sessionId?: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `request.user.id` geçerli bir uuid ise onu, değilse undefined döner. */
export function requestUserId(request: { readonly user?: unknown }): string | undefined {
  const user = request.user;
  if (typeof user !== 'object' || user === null || !('id' in user)) return undefined;
  const id = user.id;
  return typeof id === 'string' && UUID_PATTERN.test(id) ? id : undefined;
}
