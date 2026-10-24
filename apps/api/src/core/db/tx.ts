import { sql } from 'drizzle-orm';
import { getDb, type Db } from './client';

/** withTenantTx / withPlatformTx içinde fn'e verilen işlem nesnesi. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Bağlam kimliği uuid değilse işlem açılmadan hata verir (boş değer = sessiz 0 satır olmasın). */
export function assertUuid(value: string, name: string): void {
  if (!UUID_PATTERN.test(value)) {
    throw new TypeError(`Veritabanı bağlamı geçersiz: ${name} uuid olmalı`);
  }
}

export interface TxSettings {
  readonly businessId: string;
  readonly userId: string;
  readonly isPlatform: boolean;
}

/**
 * İşlem açar, RLS değişkenlerini parametreli `set_config(..., true)` ile (SET LOCAL etkisi)
 * ayarlar ve fn'i çağırır. fn hata atarsa işlem geri alınır. Ayarlar işlem bitince kaybolur.
 */
export function runInTx<T>(settings: TxSettings, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`
      select set_config('app.business_id', ${settings.businessId}, true),
             set_config('app.user_id', ${settings.userId}, true),
             set_config('app.is_platform', ${settings.isPlatform ? 'true' : ''}, true)
    `);
    return fn(tx);
  });
}
