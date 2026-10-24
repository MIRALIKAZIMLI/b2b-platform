// İsteğin kimliği doğrulanmış kullanıcısı. Kimlik doğrulama (F1.5) `request.user`'ı doldurur;
// o zamana kadar yalnızca testler doldurur. Değer uuid değilse kullanıcı yok sayılır.

export interface RequestUser {
  readonly id: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `request.user.id` geçerli bir uuid ise onu, değilse undefined döner. */
export function requestUserId(request: { readonly user?: unknown }): string | undefined {
  const user = request.user;
  if (typeof user !== 'object' || user === null || !('id' in user)) return undefined;
  const id = user.id;
  return typeof id === 'string' && UUID_PATTERN.test(id) ? id : undefined;
}
