// Uygulamanın kendi sürümü ve platformu (US-060). Sürüm `app.json` → `expo.version` (EAS derlemesi
// F6'da yazar); okunamazsa kontrol yapılmaz.
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { AppPlatform } from './app-config';

export const appPlatform: AppPlatform = Platform.OS === 'ios' ? 'ios' : 'android';

export function appVersion(): string {
  return Constants.expoConfig?.version ?? '';
}
