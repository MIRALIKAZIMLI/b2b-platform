// İstek kimliği (observability.md §1.1). Gelen `X-Request-Id` güvenli biçimdeyse korunur,
// değilse yenisi üretilir; yanıtta `X-Request-Id` başlığıyla döner.
// Fastify `genReqId`, middleware, logger (pino-http) ve hata filtresi aynı kimliği kullanır:
// ilk çağrı belirler, diğerleri aynısını okur.
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import { FastifyAdapter } from '@nestjs/platform-fastify';

export const REQUEST_ID_HEADER = 'X-Request-Id';

const SAFE_REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;

const requestIds = new WeakMap<IncomingMessage, string>();

export function isSafeRequestId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_REQUEST_ID.test(value);
}

/** İsteğin kimliğini döner; ilk çağrıda belirler (Fastify `genReqId` de bunu kullanır). */
export function resolveRequestId(req: IncomingMessage): string {
  const existing = requestIds.get(req);
  if (existing !== undefined) {
    return existing;
  }
  const incoming = req.headers[REQUEST_ID_HEADER.toLowerCase()];
  const requestId = isSafeRequestId(incoming) ? incoming : randomUUID();
  requestIds.set(req, requestId);
  return requestId;
}

/** İsteğin kimliğini döner ve yanıt başlığına yazar. */
export function ensureRequestId(req: IncomingMessage, res: ServerResponse): string {
  const requestId = resolveRequestId(req);
  if (!res.headersSent && res.getHeader(REQUEST_ID_HEADER) === undefined) {
    res.setHeader(REQUEST_ID_HEADER, requestId);
  }
  return requestId;
}

/**
 * Fastify adaptörü: Fastify'ın kendi istek kimliği (`request.id`, log bağlamı) da aynı kimliktir.
 * main.ts ve testler bunu kullanır.
 */
export function createFastifyAdapter(): FastifyAdapter {
  return new FastifyAdapter({ requestIdHeader: false, genReqId: resolveRequestId });
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware<IncomingMessage, ServerResponse> {
  use(req: IncomingMessage, res: ServerResponse, next: () => void): void {
    ensureRequestId(req, res);
    next();
  }
}
