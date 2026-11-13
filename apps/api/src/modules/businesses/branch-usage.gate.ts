// Şube kullanımı kapısı (F2.5 S3, kullanıcı kararı 2026-11-13): aktif üyesi veya açık daveti olan
// şube pasifleşemez; önce üyeler başka şubeye taşınır. Üyelik ve davet `access` modülündedir;
// c4 yönü `access → businesses` olduğundan businesses access'i içe aktaramaz. Bu soyut sınıf Nest
// belirtecidir; uygulamasını access sağlar (`BranchUsageGateModule`, global).
import type { Tx } from '../../core/db';

export abstract class BranchUsageGate {
  /** Şubeye bağlı aktif üye ve açık davet sayısı; çağıranın kiracı işleminde okunur. */
  abstract countBoundTx(
    tx: Tx,
    businessId: string,
    branchId: string,
    now: Date,
  ): Promise<{ members: number; invitations: number }>;
}
