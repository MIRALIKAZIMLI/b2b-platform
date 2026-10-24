// Olay kaydı ve yazıcının veritabanına gitmeden yaptığı doğrulamalar (K6, D3).
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import type { Tx } from '../../db';
import {
  OUTBOX_EVENTS,
  OUTBOX_QUEUE_NAMES,
  outboxEventDefinition,
  PAYLOAD_FIELD_KINDS,
} from '../event-registry';
import { OutboxWriter } from '../outbox.writer';

/** Yazıcı doğrulamayı geçerse veritabanına gider; bu testte gitmemeli. */
const unusedTx = new Proxy(
  {},
  {
    get() {
      throw new Error('veritabanına gidilmemeliydi');
    },
  },
) as Tx;

function validEvent() {
  return {
    type: 'test.ping' as const,
    aggregateType: 'test',
    aggregateId: randomUUID(),
    businessIds: [randomUUID()],
    payload: { ref: randomUUID(), count: 1 },
  };
}

async function errorOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
}

describe('outbox olay kaydı', () => {
  it('K6: her olay türü bilinen bir kuyruğa eşlenir', () => {
    for (const [type, definition] of Object.entries(OUTBOX_EVENTS)) {
      expect(OUTBOX_QUEUE_NAMES, type).toContain(definition.queue);
    }
    expect(outboxEventDefinition('test.ping')?.queue).toBe('test');
    expect(outboxEventDefinition('bilinmeyen.olay')).toBeUndefined();
  });

  it('D3: yük alanları yalnızca kimlik, kod veya sayıdır', () => {
    for (const [type, definition] of Object.entries(OUTBOX_EVENTS)) {
      for (const [field, kind] of Object.entries(definition.fields)) {
        const allowed = Array.isArray(kind) || PAYLOAD_FIELD_KINDS.includes(kind as never);
        expect(allowed, `${type}.${field}`).toBe(true);
      }
    }
  });

  it('D3: telefon veya ad alanı taşıyan yük → doğrulama hatası', async () => {
    const writer = new OutboxWriter();
    const phone = await errorOf(
      writer.write(unusedTx, {
        ...validEvent(),
        payload: { ref: randomUUID(), count: 1, phone: '+994501234567' } as never,
      }),
    );
    const name = await errorOf(
      writer.write(unusedTx, {
        ...validEvent(),
        payload: { ref: randomUUID(), count: 1, name: 'Ali' } as never,
      }),
    );

    expect(phone).toBeInstanceOf(ZodError);
    expect(name).toBeInstanceOf(ZodError);
  });

  it('D3: kimlik alanına serbest metin → doğrulama hatası', async () => {
    const error = await errorOf(
      new OutboxWriter().write(unusedTx, {
        ...validEvent(),
        payload: { ref: 'Ali Veli', count: 1 },
      }),
    );
    expect(error).toBeInstanceOf(ZodError);
  });

  it('D3: business_ids boş olamaz', async () => {
    const error = await errorOf(
      new OutboxWriter().write(unusedTx, { ...validEvent(), businessIds: [] }),
    );
    expect(error).toBeInstanceOf(ZodError);
  });

  it('K6: aggregate_id uuid olmalı', async () => {
    const error = await errorOf(
      new OutboxWriter().write(unusedTx, { ...validEvent(), aggregateId: 'x' }),
    );
    expect(error).toBeInstanceOf(ZodError);
  });
});
