import { Injectable } from '@nestjs/common';
import type { LocalizedText } from '@b2b/shared';
import { sql } from 'drizzle-orm';
import { withSystemTx } from '../../core/db';
import type { LanguageRow } from './i18n-snapshot';
import type { I18nRepositoryPort, Region } from './i18n.ports';

interface LanguageDbRow extends Record<string, unknown> {
  code: string;
  is_active: boolean;
  is_default: boolean;
  sort_order: number;
  translations: Record<string, string>;
}

interface RegionDbRow extends Record<string, unknown> {
  id: string;
  country_code: string;
  parent_id: string | null;
  type: 'city' | 'district';
  name: LocalizedText;
}

/**
 * G tabloları herkese okunur (SELECT USING (true)); okuma kiracısız ve kullanıcısız olduğu için
 * withSystemTx ile yapılır (data-model §1.1). Yazma bu adımda yok (admin ekranı F6).
 */
@Injectable()
export class I18nRepository implements I18nRepositoryPort {
  async loadLanguages(): Promise<LanguageRow[]> {
    const result = await withSystemTx((tx) =>
      tx.execute<LanguageDbRow>(sql`
        select l.code, l.is_active, l.is_default, l.sort_order,
               coalesce(jsonb_object_agg(t.key, t.value) filter (where t.key is not null),
                        '{}'::jsonb) as translations
          from languages l
          left join ui_translations t on t.lang = l.code
         group by l.code
         order by l.sort_order, l.code
      `),
    );
    return result.rows.map((row) => ({
      code: row.code,
      isActive: row.is_active,
      isDefault: row.is_default,
      sortOrder: row.sort_order,
      values: row.translations,
    }));
  }

  async listRegions(countryCode: string): Promise<Region[]> {
    const result = await withSystemTx((tx) =>
      tx.execute<RegionDbRow>(sql`
        select id, country_code, parent_id, type, name
          from regions
         where country_code = ${countryCode}
         order by case type when 'city' then 0 else 1 end, name ->> 'az', id
      `),
    );
    return result.rows.map((row) => ({
      id: row.id,
      countryCode: row.country_code,
      parentId: row.parent_id,
      type: row.type,
      name: row.name,
    }));
  }
}
