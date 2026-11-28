export { I18nModule } from './i18n.module';
export { I18nService } from './i18n.service';
export { ReferenceLookup } from './reference-lookup';
export { type I18nSeedResult, seedI18n } from './seed/i18n.seed';
/** F3.11c: şablon/rapor anahtarlarının metni olduğunu denetleyen testler için. */
export { IMPORT_MESSAGES } from './seed/import-messages';
// Başka modüllerin FK'ları için tablo tanımları (ör. businesses.region_id, F1.7).
export { countries, currencies, languages, regions } from './i18n.schema';
