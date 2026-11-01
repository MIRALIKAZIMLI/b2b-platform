// Depo sayısı hakkı (`warehouses.max`, US-011 AC2) için kapı. Hak kontrolü `billing`
// modülündedir; c4-component §1 yönü `billing → businesses` olduğundan `businesses` billing'i
// içe aktaramaz. Bu soyut sınıf Nest belirtecidir; uygulamasını billing sağlar
// (`WarehouseLimitGateModule`, global) ve aynı yerde aktif depo sayacını kaydeder.
import type { Tx } from '../../core/db';

export abstract class WarehouseLimitGate {
  /**
   * Bir aktif depo daha eklenebilir mi? Aşılacaksa `ENTITLEMENT_LIMIT_REACHED` fırlatır.
   * Değer ve kullanım çağıranın kiracı işleminde okunur (depoyu ekleyen işlemle aynı).
   */
  abstract assertCanAddActive(tx: Tx, businessId: string): Promise<void>;
}
