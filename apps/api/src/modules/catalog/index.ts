export { CatalogModule } from './catalog.module';
export { type CatalogSeedResult, seedCatalog } from './catalog.seed';
export { SEED_CATEGORIES, type SeedCategory } from './seed/categories';
export { SEED_UNIT_CONVERSIONS, SEED_UNITS } from './seed/units';
export {
  type NewUnit,
  type UnitCatalogView,
  type UnitConversionInput,
  type UnitConversionView,
  type UnitPatch,
  UnitsService,
  type UnitView,
} from './units.service';
export { type ActivityTypeAdminView, ActivityTypesAdminService } from './activity-types.service';
export { BrandStateMachine } from './brand.state-machine';
export {
  type AdminBrandView,
  type BrandDecision,
  type BrandOptionView,
  type BrandRequestView,
  BrandsService,
} from './brands.service';
export { CategoriesService, type CategoryView, visibleCategories } from './categories.service';
// Başka modüllerin FK'ları için tablo tanımları (F3.3a: ürün ve ambalaj birimi, kategori, marka).
export { brands, categories, unitConversions, units } from './catalog.schema';
