import { assertUuid, runInTx, type Tx } from './tx';

/** Platform işlemi bağlamı: kiracı yoktur, yalnızca işlemi yapan platform kullanıcısı. */
export interface PlatformTxContext {
  readonly userId: string;
}

/**
 * Platform bağlamında işlem: `app.user_id` ve `app.is_platform = 'true'` ayarlanır,
 * `app.business_id` ayarlanmaz (data-model §1.1). Yalnızca `platform-admin` modülü kullanır
 * (coding-guidelines §3.7); bu kısıt henüz lint ile zorlanmıyor.
 */
export async function withPlatformTx<T>(
  ctx: PlatformTxContext,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  assertUuid(ctx.userId, 'userId');
  return await runInTx({ businessId: '', userId: ctx.userId, isPlatform: true }, fn);
}
