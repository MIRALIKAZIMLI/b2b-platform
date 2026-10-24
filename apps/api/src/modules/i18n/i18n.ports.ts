import type { LocalizedText } from '@b2b/shared';
import type { LanguageRow } from './i18n-snapshot';

/** openapi.yaml `Region`. */
export interface Region {
  readonly id: string;
  readonly countryCode: string;
  readonly parentId: string | null;
  readonly type: 'city' | 'district';
  readonly name: LocalizedText;
}

export interface I18nRepositoryPort {
  /** Bütün diller ve her dilin çevirileri (tek sorgu). */
  loadLanguages(): Promise<LanguageRow[]>;
  /** Ülkenin bölgeleri: önce şehirler, sonra rayonlar; az adına göre. */
  listRegions(countryCode: string): Promise<Region[]>;
}

/** SettingsService'in i18n'in kullandığı kısmı. */
export interface I18nSettingsPort {
  get(key: 'i18n.cache_ttl_seconds'): Promise<number>;
}
