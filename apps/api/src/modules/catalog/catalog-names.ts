// Katalog adlarının ortak kuralları (F3.2a K3): aynı kapsamda (aynı üst kategori, faaliyet
// alanları) iki kayıt aynı dilde aynı adı taşıyamaz. Karşılaştırma büyük/küçük harf ve kenar
// boşluğu duyarsızdır; yalnız iki kayıtta da dolu olan diller karşılaştırılır.
import { CATALOG_LANGS } from '@b2b/shared';

function normalized(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim().toLocaleLowerCase('tr') : undefined;
}

function textOf(name: unknown, lang: string): string | undefined {
  if (typeof name !== 'object' || name === null) return undefined;
  return normalized((name as Record<string, unknown>)[lang]);
}

export function namesClash(a: unknown, b: unknown): boolean {
  return CATALOG_LANGS.some((lang) => {
    const left = textOf(a, lang);
    return left !== undefined && left.length > 0 && left === textOf(b, lang);
  });
}

/** İki ad nesnesi aynı mı (değişiklik yoksa audit ve güncelleme atlanır). */
export function sameName(a: unknown, b: Readonly<Record<string, string | undefined>>): boolean {
  if (typeof a !== 'object' || a === null) return false;
  const sorted = (value: object) =>
    JSON.stringify(
      Object.entries(value)
        .filter(([, text]) => text !== undefined)
        .sort(([x], [y]) => x.localeCompare(y)),
    );
  return sorted(a) === sorted(b);
}
