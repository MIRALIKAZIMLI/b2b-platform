export { BUSINESS_LOGO_PORT, type BusinessLogoPort } from './business-logo.port';
export { BusinessesModule } from './businesses.module';
export {
  type ActivityTypeItem,
  type BusinessRow,
  BusinessesRepository,
  type NewBuyerBusiness,
  type CapabilityRow,
  isVoenUniqueViolation,
  type NewSellerBusiness,
  type OwnPersonData,
  type OwnProfilePatch,
  type SellerListItem,
} from './businesses.repository';
export {
  type SellerApplicationReview,
  type SellerApplicationRow,
  SellerApplicationsRepository,
} from './seller-applications.repository';
export {
  CAPABILITIES,
  CAPABILITY_STATUSES,
  type Capability,
  type CapabilityStatus,
  SELLER_APPLICATION_STATUSES,
  type SellerApplicationStatus,
} from './businesses.schema';
// Başka modüllerin FK'ları için tablo tanımı (ör. subscriptions.business_id, F1.4b;
// memberships.branch_id / warehouse_id, F1.8a).
export { branches, businesses, warehouses } from './businesses.schema';
export {
  profileCompleteness,
  PROFILE_FIELDS,
  type ProfileField,
  SIGNUP_FILLED_FIELDS,
} from './profile-completeness';
export { type BusinessesSeedResult, seedBusinesses } from './seed/businesses.seed';
export {
  IpHourlyRateLimiter,
  type IpRateDecision,
  type IpRateScope,
} from './ip-hourly-rate-limiter';
export { requireVoen, type VoenHolder } from './voen-guard';
export { SellerSetupRepository } from './seller-setup.repository';
export { WarehouseLimitGate } from './warehouse-limit.gate';
export {
  BRANCH_APPROVAL_RULES,
  type BranchApprovalRule,
  requiresBranchApproval,
} from './branch-approval';
export { BranchUsageGate } from './branch-usage.gate';
