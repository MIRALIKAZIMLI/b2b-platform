// Dizin D okuması (F2.11a, data-model §1 D sınıfı). Başka kiracının satırları yalnız
// `0020_directory.sql` SECURITY DEFINER fonksiyonlarıyla okunur; görünürlük ayarı fonksiyon
// içinde uygulanır (kapalı alan null gelir). Bu sınıf tablo okumaz, yalnız fonksiyon çağırır.
import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Tx } from '../../core/db';
import type { BuyerDirectoryDocument } from '../../core/ports/buyer-directory-index';

/** D fonksiyonunun döndürdüğü satır: belge + "dizinde görünme" bayrağı. */
export interface DirectoryBuyerRow {
  readonly document: BuyerDirectoryDocument;
  readonly listedInDirectory: boolean;
}

/** Fonksiyona tek metin parametre olarak verilen kimlik listesi; yalnız UUID kabul edilir. */
function uuidArrayLiteral(ids: readonly string[]): string {
  const valid = z.array(z.uuid()).parse(ids);
  return `{${valid.join(',')}}`;
}

interface DocumentRow extends Record<string, unknown> {
  id: string;
  legal_name: string;
  activity_type_id: string;
  region_id: string;
  city_id: string;
  verified: boolean;
  listed_in_directory: boolean;
  logo_file_id: string | null;
  address_line: string | null;
  business_phone: string | null;
  voen: string | null;
  contact_name: string | null;
}

@Injectable()
export class DirectoryRepository {
  /**
   * İndekslenebilir perakendecilerin belgeleri (aktif, `buyer` onaylı). Dönmeyen kimlik
   * indekslenemez: tüketici onu siler. Çağıran: worker (bağlamsız) veya onaylı seller bağlamı.
   */
  async documentsTx(tx: Tx, ids: readonly string[]): Promise<DirectoryBuyerRow[]> {
    if (ids.length === 0) return [];
    const result = await tx.execute<DocumentRow>(
      sql`select * from directory_buyer_documents(${uuidArrayLiteral(ids)}::uuid[])`,
    );
    return result.rows.map((row) => ({
      listedInDirectory: row.listed_in_directory,
      document: {
        id: row.id,
        legalName: row.legal_name,
        activityTypeId: row.activity_type_id,
        regionId: row.region_id,
        cityId: row.city_id,
        verified: row.verified,
        logoFileId: row.logo_file_id,
        addressLine: row.address_line,
        businessPhone: row.business_phone,
        voen: row.voen,
        contactName: row.contact_name,
      },
    }));
  }

  /** Yeniden indeksleme: dizinde görünmesi gereken kimlikler, `after`'dan sonra (id sırası). */
  async pageTx(tx: Tx, after: string | null, limit: number): Promise<string[]> {
    const result = await tx.execute<{ id: string }>(
      sql`select id from directory_buyer_page(${after}::uuid, ${limit}::integer) as id`,
    );
    return result.rows.map((row) => row.id);
  }

  /**
   * Tam telefon (E.164) veya tam VÖEN eşleşmesi (US-020); yalnız kimlik. Yalnız onaylı seller
   * bağlamında çalışır (aksi 42501). Uç ve hız sınırı F2.11b'de.
   */
  async exactMatchTx(
    tx: Tx,
    query: { readonly phone: string } | { readonly voen: string },
  ): Promise<string[]> {
    const phone = 'phone' in query ? query.phone : null;
    const voen = 'voen' in query ? query.voen : null;
    const result = await tx.execute<{ id: string }>(
      sql`select id from directory_buyer_exact_match(${phone}::text, ${voen}::text) as id`,
    );
    return result.rows.map((row) => row.id);
  }
}
