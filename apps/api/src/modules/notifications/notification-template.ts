// Şablon çözümü (F1.11-AC5, US-058 AC3): alıcının dilindeki şablon; yoksa varsayılan `az`.
// `{ad}` yer tutucuları yükteki kod/sayı parametreleriyle doldurulur; bilinmeyen yer tutucu olduğu
// gibi kalır. Kişisel veri parametre olarak gelemez (yük kuralı, ADR-0010 §3).

export const FALLBACK_LANGUAGE = 'az';

export interface TemplateText {
  readonly title: string;
  readonly body: string;
}

/** Bir türün dillere göre şablonları (dil kodu → metin). */
export type TemplatesByLang = ReadonlyMap<string, TemplateText>;

function fill(text: string, params: Readonly<Record<string, string | number>>): string {
  return text.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

/**
 * Kullanıcının dilinde metin; o dilde şablon yoksa `az`; o da yoksa undefined.
 * `lang` boşsa (kullanıcı dil seçmemiş) doğrudan `az`.
 */
export function renderTemplate(
  templates: TemplatesByLang,
  lang: string | null,
  params: Readonly<Record<string, string | number>>,
): (TemplateText & { readonly lang: string }) | undefined {
  const chosen = (lang === null ? undefined : templates.get(lang)) ?? undefined;
  const resolvedLang = chosen === undefined ? FALLBACK_LANGUAGE : (lang ?? FALLBACK_LANGUAGE);
  const template = chosen ?? templates.get(FALLBACK_LANGUAGE);
  if (template === undefined) return undefined;
  return {
    lang: resolvedLang,
    title: fill(template.title, params),
    body: fill(template.body, params),
  };
}
