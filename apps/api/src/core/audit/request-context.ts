// İstekten audit bağlamı (istek kimliği, IP). Controller'lar kullanır (F2.1a).
import { z } from 'zod';
import { resolveRequestId } from '../request-id.middleware';
import type { AuditRequestContext } from './audit.service';

/** Fastify isteğinden kullanılan kısım (fastify doğrudan bağımlılık değil). */
export interface AuditHttpRequest {
  readonly ip?: string;
  readonly raw: Parameters<typeof resolveRequestId>[0];
}

const ipSchema = z.union([z.ipv4(), z.ipv6()]);

export function requestAuditContext(req: AuditHttpRequest): AuditRequestContext {
  const ip = ipSchema.safeParse(req.ip);
  return { requestId: resolveRequestId(req.raw), ...(ip.success ? { ip: ip.data } : {}) };
}
