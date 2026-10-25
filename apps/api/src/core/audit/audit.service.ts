// Audit yazıcı (F1.9, US-057). Kayıt, işlemi yapan servisin veritabanı işleminde yazılır: `tx`
// zorunludur; işlem geri alınırsa kayıt da yoktur. 🔒 alanlar maskelenir; zaman Clock'tan.
// Yalnızca ekleme: bu sınıfta güncelleme veya silme metodu yoktur (coding-guidelines §4.6) ve
// app_user'ın tabloda UPDATE/DELETE/SELECT izni yoktur. INSERT … RETURNING kullanılmaz.
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Clock } from '../clock';
import type { Tx } from '../db';
import {
  AUDIT_ACTIONS,
  AUDIT_TARGET_TYPES,
  type AuditAction,
  type AuditTargetType,
} from './audit-actions';
import { maskAuditValue } from './audit-mask';
import { auditLogs } from './audit.schema';

export interface AuditActor {
  readonly type: 'user' | 'system' | 'platform';
  /** Sistem işlerinde null. */
  readonly userId: string | null;
}

/** İsteğe ait bilgiler; çağıran taraf (controller) parametreyle verir. */
export interface AuditRequestContext {
  /** `resolveRequestId(req)` değeri. */
  readonly requestId?: string;
  /** Fastify `request.ip` (proxy arkasındaki gerçek IP güveni F6/infra kararı). */
  readonly ip?: string;
}

export interface AuditEntry {
  readonly actor: AuditActor;
  readonly impersonationSessionId?: string;
  /** İşlemin ait olduğu kiracı; platform geneli işlemde null. */
  readonly businessId: string | null;
  readonly action: AuditAction;
  readonly targetType: AuditTargetType;
  readonly targetId: string;
  readonly before?: unknown;
  readonly after?: unknown;
  readonly context?: AuditRequestContext;
}

/** Audit yazma yeteneği; diğer servisler bu arayüze bağlanır (birim testte sahtesi verilir). */
export interface AuditRecorder {
  record(tx: Tx, entry: AuditEntry): Promise<void>;
}

const entrySchema = z.object({
  actor: z.object({
    type: z.enum(['user', 'system', 'platform']),
    userId: z.uuid().nullable(),
  }),
  impersonationSessionId: z.uuid().optional(),
  businessId: z.uuid().nullable(),
  action: z.enum(AUDIT_ACTIONS),
  targetType: z.enum(AUDIT_TARGET_TYPES),
  targetId: z.string().min(1).max(200),
  context: z
    .object({
      requestId: z.string().min(1).max(64).optional(),
      ip: z.union([z.ipv4(), z.ipv6()]).optional(),
    })
    .optional(),
});

@Injectable()
export class AuditService implements AuditRecorder {
  constructor(@Inject(Clock) private readonly clock: Clock) {}

  async record(tx: Tx, entry: AuditEntry): Promise<void> {
    const valid = entrySchema.parse(entry);
    await tx.insert(auditLogs).values({
      occurredAt: this.clock.now(),
      actorUserId: valid.actor.userId,
      actorType: valid.actor.type,
      impersonationSessionId: valid.impersonationSessionId ?? null,
      businessId: valid.businessId,
      action: valid.action,
      targetType: valid.targetType,
      targetId: valid.targetId,
      before: toJsonb(entry.before),
      after: toJsonb(entry.after),
      ip: valid.context?.ip ?? null,
      requestId: valid.context?.requestId ?? null,
    });
  }
}

/** undefined → SQL NULL; diğer değerler maskelenerek jsonb'ye yazılır. */
function toJsonb(value: unknown): unknown {
  return value === undefined ? null : maskAuditValue(value);
}
