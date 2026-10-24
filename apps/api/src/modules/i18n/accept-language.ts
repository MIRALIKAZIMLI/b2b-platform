// `Accept-Language` başlığından dil adayları (RFC 9110 §12.5.4, sadeleştirilmiş).
// Yalnızca ana dil etiketi kullanılır (`ru-RU` → `ru`); hangi adayın sunulacağına
// I18nSnapshot karar verir (aktif diller).

/** Kötüye kullanıma karşı okunan en fazla girdi. */
const MAX_ENTRIES = 20;

const LANGUAGE_TAG = /^([a-z]{2,3})(?:-[a-z0-9]{1,8})*$/;
const QUALITY = /^q=(0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/;

interface Candidate {
  readonly lang: string;
  readonly quality: number;
  readonly index: number;
}

function parseEntry(entry: string, index: number): Candidate | undefined {
  const [rawTag = '', ...params] = entry.split(';').map((part) => part.trim().toLowerCase());
  const tag = LANGUAGE_TAG.exec(rawTag);
  if (tag === null) return undefined;
  let quality = 1;
  for (const param of params) {
    if (!param.startsWith('q=')) continue;
    const match = QUALITY.exec(param);
    if (match === null) return undefined;
    quality = Number(match[1]);
  }
  if (quality === 0) return undefined;
  return { lang: tag[1] ?? '', quality, index };
}

/** Dil adayları: q değerine göre azalan, eşitlikte başlıktaki sıra; tekrarsız. */
export function parseAcceptLanguage(header: string | undefined): string[] {
  if (header === undefined || header.trim() === '') return [];
  const candidates = header
    .split(',')
    .slice(0, MAX_ENTRIES)
    .flatMap((entry, index) => parseEntry(entry, index) ?? []);
  candidates.sort((a, b) => b.quality - a.quality || a.index - b.index);
  return [...new Set(candidates.map((candidate) => candidate.lang))];
}
