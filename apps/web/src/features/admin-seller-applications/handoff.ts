// Başvurudan toptancı açma (F2.2b): seçilen başvuru, "Yeni toptancı" formuna yalnızca bellekte
// taşınır. Kişisel veri (yetkili adı, telefon) adrese yazılmaz; adreste yalnızca başvuru kimliği.
// Sayfa yenilenirse ön doldurma kaybolur, form başvuru kimliğiyle yine gönderilir.
import {
  DEFAULT_CURRENCY,
  DEFAULT_TIMEZONE,
  emptySellerForm,
  type SellerFormValues,
} from '../admin-sellers/form';

export interface ApplicationPrefill {
  readonly id: string;
  readonly legalName: string;
  readonly voen: string;
  readonly regionId: string;
  readonly contactName: string;
  readonly phone: string;
}

let selected: ApplicationPrefill | undefined;

export function handOffApplication(application: ApplicationPrefill): void {
  selected = application;
}

/** Kimlik eşleşirse seçili başvuru (StrictMode'da iki kez okunabilir; silmez, yenisi üzerine yazar). */
export function selectedApplication(id: string): ApplicationPrefill | undefined {
  return selected?.id === id ? selected : undefined;
}

export function clearSelectedApplication(): void {
  selected = undefined;
}

/** Başvurudaki alanlarla dolu "Yeni toptancı" formu; plan ve hizmet bölgelerini admin seçer. */
export function sellerFormFromApplication(application: ApplicationPrefill): SellerFormValues {
  return {
    legalName: application.legalName,
    voen: application.voen,
    regionId: application.regionId,
    addressLine: '',
    ownerName: application.contactName,
    ownerPhone: application.phone,
    planId: '',
    serviceAreaRegionIds: [],
    currency: DEFAULT_CURRENCY,
    timezone: DEFAULT_TIMEZONE,
  };
}

/**
 * "Yeni toptancı" formunun ilk değeri (B1): başvuru bellekte varsa dolu form + `prefilled`;
 * sayfa yenilenip bellek kaybolduysa boş form ve `prefilled: false` (aksi hâlde "başvuruyla
 * dolduruldu" yazısı boş forma bakar).
 */
export function initialSellerForm(applicationId: string | undefined): {
  readonly values: SellerFormValues;
  readonly prefilled: boolean;
} {
  const application = applicationId === undefined ? undefined : selectedApplication(applicationId);
  return application === undefined
    ? { values: emptySellerForm(), prefilled: false }
    : { values: sellerFormFromApplication(application), prefilled: true };
}
