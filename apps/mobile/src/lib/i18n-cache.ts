// Cihazdaki çeviri önbelleği ve girişten önce seçilen dil (F1.14a). `expo-file-system` ile
// uygulamanın belge klasörüne yazılır. Burada gizli bilgi yoktur (yalnızca herkese açık çeviriler
// ve dil kodu); oturum anahtarları burada saklanmaz (`session.ts`).
import { Directory, File, Paths } from 'expo-file-system';
import {
  type CachedMessages,
  type MessageCache,
  type SupportedLanguage,
  isSupportedLanguage,
} from './i18n';

const DIR_NAME = 'i18n';
const LANGUAGE_FILE = 'language.txt';

function dir(): Directory {
  const directory = new Directory(Paths.document, DIR_NAME);
  if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
  return directory;
}

function isCachedMessages(value: unknown): value is CachedMessages {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as { etag?: unknown; values?: unknown };
  return (
    typeof entry.etag === 'string' && typeof entry.values === 'object' && entry.values !== null
  );
}

async function readText(file: File): Promise<string | undefined> {
  return file.exists ? file.text() : undefined;
}

async function writeText(file: File, content: string): Promise<void> {
  if (!file.exists) file.create();
  await file.write(content);
}

export const fileMessageCache: MessageCache = {
  async read(lang) {
    const text = await readText(new File(dir(), `${lang}.json`));
    if (text === undefined) return undefined;
    try {
      const parsed: unknown = JSON.parse(text);
      return isCachedMessages(parsed) ? parsed : undefined;
    } catch {
      // Bozuk dosya: önbellek yok sayılır, sözlük yeniden indirilir.
      return undefined;
    }
  },
  write: (lang, entry) => writeText(new File(dir(), `${lang}.json`), JSON.stringify(entry)),
};

/** Girişten önce seçilen dil (profile yazılmaz; girişte profildeki dil geçerli olur). */
export async function readDeviceLanguage(): Promise<SupportedLanguage | undefined> {
  const text = (await readText(new File(dir(), LANGUAGE_FILE)))?.trim();
  return isSupportedLanguage(text) ? text : undefined;
}

export function writeDeviceLanguage(lang: SupportedLanguage): Promise<void> {
  return writeText(new File(dir(), LANGUAGE_FILE), lang);
}
