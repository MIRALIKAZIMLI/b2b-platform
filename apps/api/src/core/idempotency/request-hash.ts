// İstek özeti (F1.2b K4): yöntem + yol + sorgu dizesi + X-Business-Id + kanonik JSON gövde.
// Aynı `Idempotency-Key` farklı bir istekle gelirse özet farklı olur → IDEMPOTENCY_CONFLICT.
import { createHash } from 'node:crypto';

/** Nesne anahtarları sıralı, boşluksuz JSON; `undefined` alanlar atlanır (JSON.stringify gibi). */
export function canonicalJson(value: unknown): string {
  // Gövdesiz istek: JSON.stringify(undefined) metin değil undefined döner.
  if (value === undefined) return 'null';
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value !== 'object' || value === null) return value;
  const record = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    sorted[key] = sortKeys(record[key]);
  }
  return sorted;
}

export interface HashedRequest {
  readonly method: string;
  /** Yol + sorgu dizesi (`/api/v1/x?a=1`). */
  readonly url: string;
  readonly businessId: string | undefined;
  readonly body: unknown;
}

/** SHA-256 (onaltılık). Alanlar JSON dizisi olarak birleştirilir; sınırlar kaydırılamaz. */
export function requestHash(request: HashedRequest): string {
  const parts = [
    request.method,
    request.url,
    request.businessId ?? null,
    canonicalJson(request.body),
  ];
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}
