// Mobil tema (ui-guidelines.md §2–§4, §6): renk, boşluk, köşe ve gölge değerleri tek yerde.
// Zemin Slate, vurgu Indigo/Violet/Emerald; kırmızı yalnız hata metninde. İlk kullanım F2.3b.
import { type ViewStyle } from 'react-native';

export const colors = {
  background: '#f8fafc', // slate-50
  surface: '#ffffff',
  surfaceMuted: '#f1f5f9', // slate-100
  border: 'rgba(226, 232, 240, 0.8)', // slate-200/80
  borderStrong: '#cbd5e1', // slate-300
  text: '#0f172a', // slate-900
  textMuted: 'rgba(15, 23, 42, 0.6)', // başlık renginden ~%60 opaklık
  textSubtle: 'rgba(15, 23, 42, 0.4)',
  accent: '#4f46e5', // indigo-600
  accentSoft: '#eef2ff', // indigo-50
  accentAlt: '#7c3aed', // violet-600
  success: '#10b981', // emerald-500
  danger: '#e11d48', // rose-600
  dangerSoft: '#fff1f2', // rose-50
  onAccent: '#ffffff',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { md: 12, lg: 16, xl: 24, pill: 999 } as const;

/** Dokunma alanı alt sınırı (44×44). */
export const touchTarget = 44;

/** Yumuşak, katmanlı gölge (iOS shadow + Android elevation). */
export function softShadow(level: 1 | 2 | 3 = 1): ViewStyle {
  return {
    shadowColor: '#0f172a',
    shadowOpacity: 0.04 + level * 0.02,
    shadowRadius: 6 + level * 6,
    shadowOffset: { width: 0, height: 2 + level * 2 },
    elevation: level * 2,
  };
}

/** Basılı durum geri bildirimi (Pressable `style` fonksiyonunda). */
export const pressed: ViewStyle = { opacity: 0.85, transform: [{ scale: 0.98 }] };
