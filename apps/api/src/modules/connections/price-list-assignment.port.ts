// Bağlantıya fiyat listesi atama portu (F3.6a, US-024 AC2). `connections` fiyat modülüne bağımlı
// olamaz (c4: pricing → connections; ters yön döngü). Arayüzü `connections` tanımlar, `pricing`
// uygular ve global modülle sağlar (`pricing/price-list-assignment.adapter.ts`; BUSINESS_LOGO_PORT kalıbı).
import type { Tx } from '../../core/db';

export interface PriceListAssignmentPort {
  /**
   * Liste satıcının `active` listesi mi. Satırı işlem sonuna kadar `FOR SHARE` kilitler: eşzamanlı
   * arşivleme (`FOR UPDATE`) bekler ve atamayı görür (K2 = A). Başka satıcının listesi RLS ile
   * görünmez → false.
   */
  lockAssignableTx(tx: Tx, sellerId: string, priceListId: string): Promise<boolean>;
}

export const PRICE_LIST_ASSIGNMENT_PORT = Symbol('PriceListAssignmentPort');
