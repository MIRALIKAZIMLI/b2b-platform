// Telefon maskeleme (observability.md §1.2, NFR-66): +994501234567 → +99450***4567.
const VISIBLE_PREFIX = 6;
const VISIBLE_SUFFIX = 4;
const MASK = '***';

export function maskPhone(phone: string): string {
  if (phone.length < VISIBLE_PREFIX + VISIBLE_SUFFIX + 1) {
    return MASK;
  }
  return `${phone.slice(0, VISIBLE_PREFIX)}${MASK}${phone.slice(-VISIBLE_SUFFIX)}`;
}
