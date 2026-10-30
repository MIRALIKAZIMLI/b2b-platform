/** API hata gövdesi veya istisna → `errors.<KOD>` çeviri anahtarının kodu; kod yoksa genel hata. */
export function errorCodeOf(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code;
  }
  return 'INTERNAL_ERROR';
}
