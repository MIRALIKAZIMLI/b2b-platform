// Kayıt formunun seçim listeleri (F2.3b): bölgeler "şehir · rayon" etiketiyle, faaliyet türleri
// arayüz dilinde (sıra API'den); profil kartı görünürlüğü. Saf fonksiyonlar; birim testli.
import type { components } from '@b2b/api-client';
import { pickLocalizedText } from '@b2b/shared';

type Region = components['schemas']['Region'];
type ActivityType = components['schemas']['ActivityType'];
type Me = components['schemas']['Me'];

export interface Option {
  readonly id: string;
  readonly label: string;
}

export function regionOptions(regions: readonly Region[], language: string): Option[] {
  const name = (region: Region) => pickLocalizedText(region.name, language) ?? region.id;
  const byId = new Map(regions.map((region) => [region.id, region]));
  return regions.map((region) => {
    const parent = region.parentId === null ? undefined : byId.get(region.parentId);
    return {
      id: region.id,
      label: parent === undefined ? name(region) : `${name(parent)} · ${name(region)}`,
    };
  });
}

export function activityOptions(types: readonly ActivityType[], language: string): Option[] {
  return types.map((type) => ({
    id: type.id,
    label: pickLocalizedText(type.name, language) ?? type.id,
  }));
}

/** Arama: büyük/küçük harf ve baştaki/sondaki boşluk önemsiz. */
export function filterOptions(options: readonly Option[], query: string): readonly Option[] {
  const needle = query.trim().toLocaleLowerCase();
  if (needle === '') return options;
  return options.filter((option) => option.label.toLocaleLowerCase().includes(needle));
}

/** US-005 AC2: profil kartı yalnız profili düzenleyebilene (`business.manage`). */
export function canManageBusiness(me: Pick<Me, 'activeBusiness'>): boolean {
  return (me.activeBusiness?.permissions ?? []).some((p) => p.code === 'business.manage');
}
