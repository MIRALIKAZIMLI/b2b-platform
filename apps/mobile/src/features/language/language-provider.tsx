// Uygulama açılışında çevirileri yükler ve dil denetleyicisini sağlar (US-058, F1.14a).
// Sözlük gelene kadar yalnızca yükleniyor göstergesi (metin yok); ağ yoksa ve önbellek de yoksa
// yeniden denenir.
import { useQuery } from '@tanstack/react-query';
import type { i18n as I18n } from 'i18next';
import { type ReactNode, createContext, useContext, useMemo } from 'react';
import { I18nextProvider } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { apiBaseUrl } from '../../lib/config';
import {
  FALLBACK_LANGUAGE,
  type MessageLoader,
  applyLanguage,
  createI18n,
  createMessageLoader,
} from '../../lib/i18n';
import { fileMessageCache, readDeviceLanguage, writeDeviceLanguage } from '../../lib/i18n-cache';
import { mobileApi, setApiLanguage } from '../../lib/session';
import { type LanguageController, createLanguageController } from './language';

interface Loaded {
  readonly i18n: I18n;
  readonly load: MessageLoader;
}

async function init(): Promise<Loaded> {
  const i18n = await createI18n();
  const load = createMessageLoader({ baseUrl: apiBaseUrl(), cache: fileMessageCache });
  const lang = (await readDeviceLanguage()) ?? FALLBACK_LANGUAGE;
  const ok = await applyLanguage(i18n, load, lang);
  if (!ok) await applyLanguage(i18n, load, FALLBACK_LANGUAGE);
  setApiLanguage(ok ? lang : FALLBACK_LANGUAGE);
  return { i18n, load };
}

const LanguageContext = createContext<LanguageController | undefined>(undefined);

export function useLanguageController(): LanguageController {
  const controller = useContext(LanguageContext);
  if (controller === undefined) throw new Error('LanguageProvider eksik');
  return controller;
}

export function LanguageProvider({ children }: { readonly children: ReactNode }) {
  const { data } = useQuery({
    queryKey: ['i18n-init'],
    queryFn: init,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: true,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 15_000),
  });

  const controller = useMemo(() => {
    if (data === undefined) return undefined;
    return createLanguageController({
      client: mobileApi().client,
      hasSession: () => mobileApi().hasSession(),
      apply: (lang) => applyLanguage(data.i18n, data.load, lang),
      setApiLanguage,
      remember: writeDeviceLanguage,
    });
  }, [data]);

  if (data === undefined || controller === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  return (
    <I18nextProvider i18n={data.i18n}>
      <LanguageContext.Provider value={controller}>{children}</LanguageContext.Provider>
    </I18nextProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
