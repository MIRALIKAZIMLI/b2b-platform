// Başvuru tablolarının (G) çağıranın işlemi içinde okunması (F2.1a; F2.3a perakendeci kaydı). platform-admin toptancı
// açılışında bölge, para birimi ve varsayılan dili aynı `withPlatformTx` içinde doğrular.
// G tabloları herkese okunur; sorgular yalnızca okur.
import { Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import type { Tx } from '../../core/db';
import { countries, currencies, languages, regions } from './i18n.schema';

@Injectable()
export class ReferenceLookup {
  /** Verilen kimliklerden var olanlar (`regions` tablosunda `is_active` kolonu yok). */
  async existingRegionIds(tx: Tx, ids: readonly string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await tx
      .select({ id: regions.id })
      .from(regions)
      .where(inArray(regions.id, [...ids]));
    return new Set(rows.map((row) => row.id));
  }

  async isActiveCurrency(tx: Tx, code: string): Promise<boolean> {
    const rows = await tx
      .select({ code: currencies.code })
      .from(currencies)
      .where(and(eq(currencies.code, code), eq(currencies.isActive, true)));
    return rows.length === 1;
  }

  /**
   * Bölgenin ülkesinin varsayılan para birimi ve saat dilimi (F2.3a: kayıt formunda bu alanlar
   * yok, K8). Bölge yoksa undefined.
   */
  async regionDefaults(
    tx: Tx,
    regionId: string,
  ): Promise<{ currencyCode: string; timezone: string } | undefined> {
    const rows = await tx
      .select({ currencyCode: countries.defaultCurrency, timezone: countries.defaultTimezone })
      .from(regions)
      .innerJoin(countries, eq(countries.code, regions.countryCode))
      .where(eq(regions.id, regionId));
    return rows[0];
  }

  async isActiveLanguage(tx: Tx, code: string): Promise<boolean> {
    const rows = await tx
      .select({ code: languages.code })
      .from(languages)
      .where(and(eq(languages.code, code), eq(languages.isActive, true)));
    return rows.length === 1;
  }

  /** Platform varsayılan dili (`languages.is_default`); yoksa undefined. */
  async defaultLanguage(tx: Tx): Promise<string | undefined> {
    const rows = await tx
      .select({ code: languages.code })
      .from(languages)
      .where(eq(languages.isDefault, true));
    return rows[0]?.code;
  }
}
