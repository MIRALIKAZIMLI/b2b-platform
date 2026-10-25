import { assertUuid, runInTx, type Tx } from './tx';

/** Kullanıcı işlemi bağlamı: işletme yoktur (U tabloları, ör. kendi oturumları; F1.5b). */
export interface UserTxContext {
  readonly userId: string;
}

/**
 * Kullanıcı bağlamında işlem: yalnızca `app.user_id` ayarlanır; `app.business_id` ve
 * `app.is_platform` boş kalır. U tablolarında kullanıcı yalnızca kendi satırlarını görür;
 * T/P tablolarında 0 satır (data-model §1.1).
 */
export async function withUserTx<T>(ctx: UserTxContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  assertUuid(ctx.userId, 'userId');
  return await runInTx({ businessId: '', userId: ctx.userId, isPlatform: false }, fn);
}
