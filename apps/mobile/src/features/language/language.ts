// Dil seçimi (US-058 AC1, F1.14a). Web (F1.13a/b) ile aynı kural:
// - Oturum varsa seçim önce profile yazılır (`PATCH /me`); hata olursa dil değişmez.
// - Girişten önceki seçim yalnızca cihazda saklanır, profile yazılmaz; girişte profildeki dil
//   geçerli olur (Mimar kararı, F1.14a planı madde 3).
import type { ApiClient } from '@b2b/api-client';
import { errorCodeOf } from '../auth/login-flow';
import { type SupportedLanguage, isSupportedLanguage } from '../../lib/i18n';

export type ChangeResult = { readonly ok: true } | { readonly ok: false; readonly code: string };

export interface LanguageControllerOptions {
  readonly client: ApiClient;
  readonly hasSession: () => boolean;
  /** Sözlüğü yükleyip uygular (`applyLanguage`); dil yoksa `false`. */
  readonly apply: (lang: SupportedLanguage) => Promise<boolean>;
  /** İstek başlığındaki dil (`Accept-Language`). */
  readonly setApiLanguage: (lang: SupportedLanguage) => void;
  /** Cihazda son seçilen dil. */
  readonly remember: (lang: SupportedLanguage) => Promise<void>;
}

export function createLanguageController(options: LanguageControllerOptions) {
  async function use(lang: SupportedLanguage): Promise<ChangeResult> {
    if (!(await options.apply(lang))) return { ok: false, code: 'NOT_FOUND' };
    options.setApiLanguage(lang);
    await options.remember(lang);
    return { ok: true };
  }

  return {
    /** Kullanıcı seçiciden dil seçti. */
    async change(lang: SupportedLanguage): Promise<ChangeResult> {
      if (options.hasSession()) {
        const { error, response } = await options.client.PATCH('/api/v1/me', {
          body: { preferredLanguage: lang },
        });
        if (!response.ok) return { ok: false, code: errorCodeOf(error) };
      }
      return use(lang);
    },

    /** Girişten sonra: profildeki dil biliniyorsa ona geçilir (profil değiştirilmez). */
    async applyProfile(preferred: unknown): Promise<ChangeResult | undefined> {
      return isSupportedLanguage(preferred) ? use(preferred) : undefined;
    },
  };
}

export type LanguageController = ReturnType<typeof createLanguageController>;
