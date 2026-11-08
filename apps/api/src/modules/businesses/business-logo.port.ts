// İşletme logosu portu (F2.10b, ADR-0024). `businesses` dosya modülüne bağımlı olamaz
// (c4: files → access → businesses; ters yön döngü yaratır). Bu yüzden arayüzü `businesses`
// tanımlar, `files` uygular ve global modülle sağlar (`files/business-logo.adapter.ts`).
import type { TenantTxContext } from '../../core/db';

export interface BusinessLogoPort {
  /**
   * Dosya bağlamdaki işletmenin, amacı `logo` olan ve `ready` durumdaki dosyası mı. Başka
   * işletmenin dosyası RLS ile görünmez → false.
   */
  isUsableLogo(ctx: TenantTxContext, fileId: string): Promise<boolean>;
  /** Hazır logonun okuma adresi (public → CDN, aksi süreli imzalı); dosya yoksa `null`. */
  readUrl(ctx: TenantTxContext, fileId: string): Promise<string | null>;
}

export const BUSINESS_LOGO_PORT = Symbol('BusinessLogoPort');
