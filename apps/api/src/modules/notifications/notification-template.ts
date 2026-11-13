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

/**
 * Değişkenli şablon (F2.18): bazı türlerde metin bir kod parametresine göre seçilir (ör. VÖEN red
 * gerekçesi `voen_rejected.<reason>`). Kod serbest metin değildir (ADR-0010 §3); çevirisi
 * şablondadır. Değişken şablon yoksa türün kendi şablonu kullanılır.
 */
const VARIANT_PARAM: Readonly<Record<string, string>> = { voen_rejected: 'reason' };

/** Türün değişken şablon anahtarı; değişkensiz türde veya parametre yoksa undefined. */
export function templateVariantKey(
  type: string,
  params: Readonly<Record<string, string | number>>,
): string | undefined {
  const name = VARIANT_PARAM[type];
  if (name === undefined) return undefined;
  const value = params[name];
  return typeof value === 'string' && /^[a-z][a-z0-9_]*$/.test(value)
    ? `${type}.${value}`
    : undefined;
}

/** Okunacak şablon anahtarları (tür + varsa değişken). */
export function templateKeysFor(
  rows: readonly { type: string; params: Readonly<Record<string, string | number>> }[],
): string[] {
  const keys = new Set<string>();
  for (const row of rows) {
    keys.add(row.type);
    const variant = templateVariantKey(row.type, row.params);
    if (variant !== undefined) keys.add(variant);
  }
  return [...keys];
}

/** Bildirimin şablonları: önce değişken, yoksa tür. */
export function templatesFor(
  all: ReadonlyMap<string, TemplatesByLang>,
  type: string,
  params: Readonly<Record<string, string | number>>,
): TemplatesByLang {
  const variant = templateVariantKey(type, params);
  return (variant === undefined ? undefined : all.get(variant)) ?? all.get(type) ?? new Map();
}
