export { BusinessesModule } from './businesses.module';
export {
  type BusinessRow,
  BusinessesRepository,
  type CapabilityRow,
  isVoenUniqueViolation,
  type NewSellerBusiness,
  type SellerListItem,
} from './businesses.repository';
export {
  CAPABILITIES,
  CAPABILITY_STATUSES,
  type Capability,
  type CapabilityStatus,
} from './businesses.schema';
// Başka modüllerin FK'ları için tablo tanımı (ör. subscriptions.business_id, F1.4b;
// memberships.branch_id / warehouse_id, F1.8a).
export { branches, businesses, warehouses } from './businesses.schema';
