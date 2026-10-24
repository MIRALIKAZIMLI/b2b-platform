import { runInTx, type Tx } from './tx';

/**
 * Bağlamsız sistem işlemi: `app.business_id`, `app.user_id` ve `app.is_platform` boş kalır,
 * bu yüzden T/P/U tablolarında 0 satır görür (kiracı verisi göremez). Yalnızca bağlamsız
 * sistem okumaları (ayar, worker) içindir; S tablolarına `SECURITY DEFINER` fonksiyonlarla
 * erişir (F1.4a K1, coding-guidelines §3.7, data-model §1.1).
 */
export async function withSystemTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return await runInTx({ businessId: '', userId: '', isPlatform: false }, fn);
}
