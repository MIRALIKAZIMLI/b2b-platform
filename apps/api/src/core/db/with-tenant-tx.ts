import { assertUuid, runInTx, type Tx } from './tx';

/** Kiracı işlemi bağlamı. userId, kullanıcısız işlerde (ör. arka plan görevi) null olur. */
export interface TenantTxContext {
  readonly businessId: string;
  readonly userId: string | null;
}

/**
 * Kiracı bağlamında işlem: `app.business_id` ve `app.user_id` ayarlanır, `app.is_platform`
 * boş bırakılır (platform yetkisi yok). RLS politikaları başka kiracının satırlarını gizler (ADR-0003).
 */
export async function withTenantTx<T>(
  ctx: TenantTxContext,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  assertUuid(ctx.businessId, 'businessId');
  if (ctx.userId !== null) {
    assertUuid(ctx.userId, 'userId');
  }
  return await runInTx(
    { businessId: ctx.businessId, userId: ctx.userId ?? '', isPlatform: false },
    fn,
  );
}
