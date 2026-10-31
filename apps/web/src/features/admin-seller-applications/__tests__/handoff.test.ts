import { describe, expect, it } from 'vitest';
import {
  clearSelectedApplication,
  handOffApplication,
  initialSellerForm,
  selectedApplication,
  sellerFormFromApplication,
} from '../handoff';

const APPLICATION = {
  id: '0190f0a0-0000-7000-8000-000000000009',
  legalName: 'Başvuru Topdan MMC',
  voen: '1234567891',
  regionId: '0190f0a0-0000-7000-8000-000000000001',
  contactName: 'Vüsal Həsənov',
  phone: '+994501234567',
};

describe('başvurudan toptancı açma (F2.2b)', () => {
  it('F2.2b seçilen başvuru yalnız kimliği eşleşirse okunur; temizlenince kaybolur', () => {
    handOffApplication(APPLICATION);
    expect(selectedApplication('başka')).toBeUndefined();
    expect(selectedApplication(APPLICATION.id)).toEqual(APPLICATION);
    expect(selectedApplication(APPLICATION.id)).toEqual(APPLICATION);
    clearSelectedApplication();
    expect(selectedApplication(APPLICATION.id)).toBeUndefined();
  });

  it('F2.2b form başvurudaki alanlarla dolar; plan ve hizmet bölgeleri boş kalır', () => {
    expect(sellerFormFromApplication(APPLICATION)).toEqual({
      legalName: 'Başvuru Topdan MMC',
      voen: '1234567891',
      regionId: APPLICATION.regionId,
      addressLine: '',
      ownerName: 'Vüsal Həsənov',
      ownerPhone: '+994501234567',
      planId: '',
      serviceAreaRegionIds: [],
      currency: 'AZN',
      timezone: 'Asia/Baku',
    });
  });

  it('B1 bellekte başvuru yoksa (sayfa yenilendi) form boş ve "dolduruldu" bayrağı kapalı', () => {
    handOffApplication(APPLICATION);
    expect(initialSellerForm(APPLICATION.id).prefilled).toBe(true);
    expect(initialSellerForm(APPLICATION.id).values.legalName).toBe(APPLICATION.legalName);
    clearSelectedApplication();
    const reloaded = initialSellerForm(APPLICATION.id);
    expect(reloaded.prefilled).toBe(false);
    expect(reloaded.values.legalName).toBe('');
    expect(initialSellerForm(undefined).prefilled).toBe(false);
  });
});
