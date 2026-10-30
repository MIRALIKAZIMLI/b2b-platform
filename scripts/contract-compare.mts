// Sözleşme karşılaştırıcısı (F1.12). openapi.yaml ile uygulamanın ürettiği şemayı
// yol + metot + yanıt kodu düzeyinde karşılaştırır. Şema gövdeleri bu adımda karşılaştırılmaz.

export const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'patch', 'head', 'options'] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

/** `"GET /api/v1/me"` → yanıt kodları (`"200"`, `"default"` …). */
export type Operations = Map<string, Set<string>>;

export interface ComparisonResult {
  /** Uygulamada olup sözleşmede olmayan uç veya yanıt kodu → `contract` işi kırmızı. */
  readonly errors: string[];
  /** Sözleşmede olup uygulamada henüz olmayan uç → yalnızca uyarı (sonraki fazlar). */
  readonly warnings: string[];
}

function isHttpMethod(value: string): value is HttpMethod {
  return (HTTP_METHODS as readonly string[]).includes(value);
}

function operationKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}

function unquote(key: string): string {
  const trimmed = key.trim();
  const quoted =
    trimmed.length >= 2 &&
    ((trimmed.startsWith("'") && trimmed.endsWith("'")) ||
      (trimmed.startsWith('"') && trimmed.endsWith('"')));
  return quoted ? trimmed.slice(1, -1) : trimmed;
}

/** `  anahtar: değer` satırı: girinti, anahtar (tırnaklı olabilir), isteğe bağlı değer. */
const KEY_LINE = /^( *)('[^']*'|"[^"]*"|[^\s#'"][^:]*?):(?:\s+(.*))?$/;

/**
 * openapi.yaml'ın `paths` bölümünden yol, metot ve yanıt kodlarını okur.
 * Dosya iki boşluk girintili blok YAML'dır; yalnızca üç anahtar düzeyi okunur:
 * yol (2), metot (4), `responses` altındaki kod (8). Beklenmeyen bir biçim görülürse hata verir
 * (sessizce eksik okumaz).
 */
export function readContractOperations(yamlText: string): Operations {
  const operations: Operations = new Map();
  const lines = yamlText.replace(/\r\n/g, '\n').split('\n');
  const start = lines.indexOf('paths:');
  if (start === -1) throw new Error('openapi.yaml: "paths:" bölümü bulunamadı');

  let path: string | undefined;
  let codes: Set<string> | undefined;
  let inResponses = false;

  for (let i = start + 1; i < lines.length; i += 1) {
    const raw = lines[i] ?? '';
    if (raw.trim() === '' || raw.trimStart().startsWith('#')) continue;
    if (!raw.startsWith(' ')) break; // sonraki üst düzey bölüm (components: …)

    const lineNo = String(i + 1);
    const match = KEY_LINE.exec(raw);
    const indent = raw.length - raw.trimStart().length;
    const key = match === null ? '' : unquote(match[2] ?? '');

    if (indent === 2) {
      if (!key.startsWith('/')) {
        throw new Error(`openapi.yaml satır ${lineNo}: yol okunamadı ("/" ile başlamalı)`);
      }
      path = key;
      codes = undefined;
      inResponses = false;
    } else if (indent === 4) {
      inResponses = false;
      codes = undefined;
      if (path !== undefined && isHttpMethod(key)) {
        codes = new Set();
        operations.set(operationKey(key, path), codes);
      }
    } else if (indent === 6 && codes !== undefined) {
      inResponses = key === 'responses';
      if (inResponses && (match?.[3] ?? '') !== '') {
        throw new Error(
          `openapi.yaml satır ${lineNo}: "responses" blok biçiminde yazılmalı (satır içi değil)`,
        );
      }
    } else if (indent === 8 && inResponses && codes !== undefined) {
      if (key === '') throw new Error(`openapi.yaml satır ${lineNo}: yanıt kodu okunamadı`);
      codes.add(key);
    }
  }
  return operations;
}

interface OpenApiLike {
  readonly paths?: Record<string, Record<string, unknown>>;
}

/** `@nestjs/swagger` belgesinden (veya başka bir OpenAPI nesnesinden) işlemleri çıkarır. */
export function readDocumentOperations(document: OpenApiLike): Operations {
  const operations: Operations = new Map();
  for (const [path, item] of Object.entries(document.paths ?? {})) {
    for (const [method, operation] of Object.entries(item)) {
      if (!isHttpMethod(method) || typeof operation !== 'object' || operation === null) continue;
      const responses = (operation as { responses?: object }).responses ?? {};
      operations.set(operationKey(method, path), new Set(Object.keys(responses)));
    }
  }
  return operations;
}

export function compareOperations(app: Operations, contract: Operations): ComparisonResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const key of [...app.keys()].sort()) {
    const contractCodes = contract.get(key);
    if (contractCodes === undefined) {
      errors.push(`${key}: uygulamada var, openapi.yaml'da yok`);
      continue;
    }
    for (const code of [...(app.get(key) ?? [])].sort()) {
      if (!contractCodes.has(code)) {
        errors.push(`${key}: yanıt kodu ${code} uygulamada var, openapi.yaml'da yok`);
      }
    }
  }
  for (const key of [...contract.keys()].sort()) {
    if (!app.has(key)) warnings.push(`${key}: openapi.yaml'da var, uygulamada henüz yok`);
  }
  return { errors, warnings };
}
