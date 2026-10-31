// Toptancının platforma giriş yolu (US-008 AC2). `onboarding.seller_mode` yalnızca `manual`
// olabilir (US-017): toptancı kendisi kaydolamaz, yalnızca başvuru formu gösterilir. Yeni bir
// mod kendi adımıyla gelir; o zaman `SellerEntry` ve bu eşleme genişler (tip kontrolü zorlar).
import { settingDefault, type SettingValue } from '@b2b/shared';

export type SellerMode = SettingValue<'onboarding.seller_mode'>;

export interface SellerEntry {
  readonly kind: 'application';
  readonly href: string;
}

export const SELLER_MODE: SellerMode = settingDefault('onboarding.seller_mode');

const ENTRY_BY_MODE: Readonly<Record<SellerMode, (locale: string) => SellerEntry>> = {
  manual: (locale) => ({ kind: 'application', href: `/${locale}/seller-application` }),
};

export function sellerEntry(mode: SellerMode, locale: string): SellerEntry {
  return ENTRY_BY_MODE[mode](locale);
}
