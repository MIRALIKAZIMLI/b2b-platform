// Ortam ayarı (F1.14a). API adresi koda yazılmaz: `apps/mobile/.env` → `EXPO_PUBLIC_API_URL`
// (Expo derlemede gömer). Yerelde telefondan bilgisayarın LAN adresi, emülatörden `10.0.2.2`.

/** Sondaki `/` atılmış API taban adresi; tanımlı değilse açık hata (geliştirici içindir). */
export function apiBaseUrl(raw: unknown = process.env.EXPO_PUBLIC_API_URL): string {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (value === '') {
    throw new Error('EXPO_PUBLIC_API_URL tanımlı değil (apps/mobile/.env.example)');
  }
  return value.replace(/\/+$/, '');
}
