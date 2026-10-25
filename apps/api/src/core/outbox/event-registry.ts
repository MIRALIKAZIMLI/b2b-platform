// Outbox olay kaydı (F1.2b): olay türü → BullMQ kuyruğu + yük alanları.
// Yük kişisel veri taşımaz (ADR-0010 §3): alan türleri yalnızca kimlik (uuid), sayı veya kod
// (sabit seçenek listesi) olabilir; serbest metin alanı tanımlanamaz. Bilinmeyen alan reddedilir.
// Bu adımda yalnızca test olayı var; gerçek olaylar ve kuyruklar modüllerle birlikte eklenir.
import { z } from 'zod';

/** Kuyruk adları. Yeni kuyruk, onu tüketen iş (F1.11 ve sonrası) ile birlikte eklenir. */
export const OUTBOX_QUEUE_NAMES = ['test', 'access'] as const;
export type OutboxQueueName = (typeof OUTBOX_QUEUE_NAMES)[number];

/** Serbest metin olmayan alan türleri. Kod alanı, seçenek listesiyle (`['a', 'b']`) tanımlanır. */
export const PAYLOAD_FIELD_KINDS = ['id', 'integer', 'number'] as const;
type ScalarKind = (typeof PAYLOAD_FIELD_KINDS)[number];
export type PayloadFieldKind = ScalarKind | readonly [string, ...string[]];

export interface OutboxEventDefinition {
  readonly queue: OutboxQueueName;
  readonly fields: Readonly<Record<string, PayloadFieldKind>>;
}

export const OUTBOX_EVENTS = {
  // Yalnızca testler için (F1.2b). Tüketicisi yok.
  'test.ping': { queue: 'test', fields: { ref: 'id', count: 'integer' } },
  // F1.8a: üyelik rolü değişti. Tüketici F1.8b (izin önbelleği temizliği).
  'membership.role_changed': {
    queue: 'access',
    fields: { membershipId: 'id', userId: 'id', oldRoleId: 'id', newRoleId: 'id' },
  },
} as const satisfies Record<string, OutboxEventDefinition>;

export type OutboxEventType = keyof typeof OUTBOX_EVENTS;

type FieldValue<K> = K extends 'id'
  ? string
  : K extends 'integer' | 'number'
    ? number
    : K extends readonly string[]
      ? K[number]
      : never;

type FieldsOf<T extends OutboxEventType> = (typeof OUTBOX_EVENTS)[T]['fields'];

export type OutboxPayload<T extends OutboxEventType> = {
  readonly [F in keyof FieldsOf<T>]: FieldValue<FieldsOf<T>[F]>;
};

function fieldSchema(kind: PayloadFieldKind): z.ZodType {
  if (typeof kind !== 'string') return z.enum(kind);
  switch (kind) {
    case 'id':
      return z.uuid();
    case 'integer':
      return z.number().int();
    case 'number':
      return z.number();
  }
}

function payloadSchema(definition: OutboxEventDefinition): z.ZodType {
  const shape: Record<string, z.ZodType> = {};
  for (const [field, kind] of Object.entries(definition.fields)) {
    shape[field] = fieldSchema(kind);
  }
  return z.strictObject(shape);
}

export interface ResolvedOutboxEvent extends OutboxEventDefinition {
  readonly payloadSchema: z.ZodType;
}

const RESOLVED: ReadonlyMap<string, ResolvedOutboxEvent> = new Map(
  Object.entries(OUTBOX_EVENTS).map(([type, definition]) => [
    type,
    { ...definition, payloadSchema: payloadSchema(definition) },
  ]),
);

/** Olay türünün tanımı; bilinmeyen türde undefined. */
export function outboxEventDefinition(type: string): ResolvedOutboxEvent | undefined {
  return RESOLVED.get(type);
}

/** Kayıtta olmayan olay türü (dağıtımda olaya özgü hata sayılır). */
export class UnknownOutboxEventError extends Error {
  override readonly name = 'UnknownOutboxEventError';

  constructor() {
    super('Bilinmeyen outbox olay türü');
  }
}
