// Dizin D okuması (F2.11a, data-model §1 D sınıfı). Başka kiracının satırları yalnız
// `0020_directory.sql` SECURITY DEFINER fonksiyonlarıyla okunur; görünürlük ayarı fonksiyon
// içinde uygulanır (kapalı alan null gelir). Bu sınıf tablo okumaz, yalnız fonksiyon çağırır.
import type { LocalizedText } from '@b2b/shared';
import { Injectable } from '@nestjs/common';
import { asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Tx } from '../../core/db';
import type { BuyerDirectoryDocument } from '../../core/ports/buyer-directory-index';
import type { FileBucket } from '../../core/ports/file-storage';
import { membershipRegions } from '../access';

/** Arama kartı (F2.11b, `directory_buyer_cards`): kapalı alan `null`. */
export interface DirectoryCardRow {
  readonly id: string;
  readonly legalName: string;
  readonly activityTypeId: string;
  readonly activityTypeName: LocalizedText;
  readonly regionId: string;
  readonly regionName: LocalizedText;
  readonly cityId: string;
  readonly verified: boolean;
  readonly listedInDirectory: boolean;
  readonly logo: { readonly bucket: FileBucket; readonly objectKey: string } | null;
  readonly addressLine: string | null;
  readonly businessPhone: string | null;
  readonly voen: string | null;
  readonly contactName: string | null;
  readonly personalPhone: string | null;
  readonly email: string | null;
}

interface CardRow extends Record<string, unknown> {
  id: string;
  legal_name: string;
  activity_type_id: string;
  activity_type_name: LocalizedText;
  region_id: string;
  region_name: LocalizedText;
  city_id: string;
  verified: boolean;
  listed_in_directory: boolean;
  logo_bucket: string | null;
  logo_object_key: string | null;
  address_line: string | null;
  business_phone: string | null;
  voen: string | null;
  contact_name: string | null;
  personal_phone: string | null;
  email: string | null;
}

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

  /**
   * Arama kartları (F2.11b). Kimlikler yalnız indeks sonucundan veya `exactMatchTx`'ten gelir
   * (Müfettiş 15 L1); fonksiyon yalnız onaylı seller bağlamında çalışır (aksi 42501), ≤20 kimlik.
   */
  async cardsTx(tx: Tx, ids: readonly string[]): Promise<DirectoryCardRow[]> {
    if (ids.length === 0) return [];
    const result = await tx.execute<CardRow>(
      sql`select * from directory_buyer_cards(${uuidArrayLiteral(ids)}::uuid[])`,
    );
    return result.rows.map((row) => ({
      id: row.id,
      legalName: row.legal_name,
      activityTypeId: row.activity_type_id,
      activityTypeName: row.activity_type_name,
      regionId: row.region_id,
      regionName: row.region_name,
      cityId: row.city_id,
      verified: row.verified,
      listedInDirectory: row.listed_in_directory,
      logo:
        (row.logo_bucket === 'public' || row.logo_bucket === 'private') &&
        row.logo_object_key !== null
          ? { bucket: row.logo_bucket, objectKey: row.logo_object_key }
          : null,
      addressLine: row.address_line,
      businessPhone: row.business_phone,
      voen: row.voen,
      contactName: row.contact_name,
      personalPhone: row.personal_phone,
      email: row.email,
    }));
  }

  /** Üyenin atandığı bölgeler (temsilci kapsamı, US-019 AC3); kendi işletmesinin satırı (RLS). */
  async memberRegionIdsTx(tx: Tx, membershipId: string): Promise<string[]> {
    const rows = await tx
      .select({ regionId: membershipRegions.regionId })
      .from(membershipRegions)
      .where(eq(membershipRegions.membershipId, membershipId))
      .orderBy(asc(membershipRegions.regionId));
    return rows.map((row) => row.regionId);
  }
}
