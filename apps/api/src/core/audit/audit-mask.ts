// 🔒 kişisel veri alanlarının audit kaydında maskelenmesi (data-model §5, coding-guidelines §7.3).
// Liste tek yerde tutulur; data-model §5'e alan eklenirse buraya da eklenir. Eşleşme anahtar
// adına göredir (snake_case ve camelCase dahil, biçimden bağımsız) ve iç içe nesne/dizilerde de
// uygulanır.

export const MASKED_AUDIT_FIELDS: readonly string[] = [
  'phone_e164',
  'full_name',
  'contact_name',
  'personal_phone',
  'email',
  'delivery_snapshot',
];

export const AUDIT_MASK = '***';

/**
 * Anahtar adı biçimden bağımsız karşılaştırılır: küçük harf, harf/rakam dışı karakterler atılır.
 * Böylece `phone_e164`, `phoneE164`, `PhoneE164`, `phone-e164` aynı alan sayılır (Müfettiş, PR #15).
 */
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const MASKED: ReadonlySet<string> = new Set(MASKED_AUDIT_FIELDS.map(normalizeKey));

/** Değerin maskeli kopyasını döner; girdiyi değiştirmez. */
export function maskAuditValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item: unknown) => maskAuditValue(item));
  }
  if (typeof value === 'object' && value !== null) {
    const masked: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      masked[key] = MASKED.has(normalizeKey(key)) ? AUDIT_MASK : maskAuditValue(item);
    }
    return masked;
  }
  return value;
}
