// Outbox yazıcı (ADR-0010 §1): olay, durumu değiştiren servisin veritabanı işleminde yazılır.
// `tx` zorunludur; işlem dışı çağrı tip olarak mümkün değildir. İşlem geri alınırsa olay da yoktur.
// INSERT … RETURNING kullanılmaz: app_user'ın outbox_events üzerinde SELECT yetkisi yok (K6).
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { Tx } from '../db';
import {
  type OutboxEventType,
  type OutboxPayload,
  outboxEventDefinition,
  UnknownOutboxEventError,
} from './event-registry';
import { outboxEvents } from './outbox.schema';

export interface OutboxEventInput<T extends OutboxEventType = OutboxEventType> {
  readonly type: T;
  /** ör. `order`, `connection` */
  readonly aggregateType: string;
  readonly aggregateId: string;
  /** Olayla ilgili kiracılar; boş olamaz. */
  readonly businessIds: readonly string[];
  readonly payload: OutboxPayload<T>;
}

const envelopeSchema = z.object({
  aggregateType: z
    .string()
    .regex(/^[a-z][a-z0-9_]*$/)
    .max(64),
  aggregateId: z.uuid(),
  businessIds: z.array(z.uuid()).min(1),
});

@Injectable()
export class OutboxWriter {
  async write<T extends OutboxEventType>(tx: Tx, event: OutboxEventInput<T>): Promise<void> {
    const definition = outboxEventDefinition(event.type);
    if (definition === undefined) {
      throw new UnknownOutboxEventError();
    }
    const envelope = envelopeSchema.parse({
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      businessIds: event.businessIds,
    });
    const payload: unknown = definition.payloadSchema.parse(event.payload);

    await tx.insert(outboxEvents).values({
      type: event.type,
      aggregateType: envelope.aggregateType,
      aggregateId: envelope.aggregateId,
      businessIds: envelope.businessIds,
      payload,
    });
  }
}
