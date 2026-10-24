export { I18nModule } from './i18n.module';
export { I18nService } from './i18n.service';
export { type I18nSeedResult, seedI18n } from './seed/i18n.seed';
// Başka modüllerin FK'ları için tablo tanımları (ör. businesses.region_id, F1.7).
export { countries, currencies, languages, regions } from './i18n.schema';
