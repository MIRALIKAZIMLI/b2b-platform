// Dosya imzası (ilk baytlar, NFR-49): bildirilen içerik türü gerçek içerikle aynı mı?
// `complete` adımında ilk 16 bayt okunur (integrations §4).

export const SIGNATURE_BYTES = 16;

export const IMAGE_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export type AllowedContentType = (typeof IMAGE_CONTENT_TYPES)[number] | typeof XLSX_CONTENT_TYPE;

/** Anahtar uzantısı. */
export const CONTENT_TYPE_EXTENSION: Readonly<Record<AllowedContentType, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  [XLSX_CONTENT_TYPE]: 'xlsx',
};

function startsWith(bytes: Buffer, prefix: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + prefix.length) return false;
  return prefix.every((value, index) => bytes[offset + index] === value);
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];
const ZIP = [0x50, 0x4b, 0x03, 0x04];

/** İlk baytlardan tür; tanınmayan içerik → `null`. XLSX bir ZIP'tir (yalnızca ZIP imzası). */
export function detectContentType(head: Buffer): AllowedContentType | null {
  if (startsWith(head, PNG)) return 'image/png';
  if (startsWith(head, JPEG)) return 'image/jpeg';
  if (startsWith(head, RIFF) && startsWith(head, WEBP, 8)) return 'image/webp';
  if (startsWith(head, ZIP)) return XLSX_CONTENT_TYPE;
  return null;
}
