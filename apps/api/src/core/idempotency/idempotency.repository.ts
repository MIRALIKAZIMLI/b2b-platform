import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { type Tx, withSystemTx } from '../db';

export interface IdempotencyLock {
  readonly key: string;
  readonly userId: string;
  readonly requestHash: string;
  /** Kilidin sahibini belirler: tamamlama ve kaldırma yalnızca aynı kilitle yapılır. */
  readonly lockedUntil: Date;
}

export interface ReserveInput extends IdempotencyLock {
  readonly endpoint: string;
  readonly now: Date;
  readonly expiresAt: Date;
}

export type ReserveResult =
  | { readonly result: 'reserved' }
  | { readonly result: 'conflict' }
  | { readonly result: 'in_progress' }
  | { readonly result: 'replay'; readonly statusCode: number; readonly body: unknown };

/** Kimliksiz kayıt (F2.3a, R13): kapsam telefon. */
export type PhoneLookupResult =
  | { readonly result: 'new' }
  | { readonly result: 'registered' }
  | { readonly result: 'conflict' }
  | { readonly result: 'replay'; readonly statusCode: number; readonly body: unknown };

export interface PhoneLookupInput {
  readonly phoneE164: string;
  readonly key: string | undefined;
  readonly endpoint: string;
  readonly requestHash: string;
  readonly now: Date;
}

export interface StoreInput {
  readonly key: string;
  readonly endpoint: string;
  readonly requestHash: string;
  readonly statusCode: number;
  readonly body: unknown;
  readonly expiresAt: Date;
}

interface ReserveRow extends Record<string, unknown> {
  result: string;
  stored_status: number | null;
  stored_body: unknown;
}

/**
 * `idempotency_keys` (S) erişimi yalnızca SECURITY DEFINER fonksiyonlarla. İstek henüz kiracı
 * bağlamına girmediği için bağlamsız sistem işlemi kullanılır (withSystemTx).
 */
@Injectable()
export class IdempotencyRepository {
  async reserve(input: ReserveInput): Promise<ReserveResult> {
    const result = await withSystemTx((tx) =>
      tx.execute<ReserveRow>(sql`
        select result, stored_status, stored_body
          from idempotency_reserve(
            ${input.key}, ${input.userId}::uuid, ${input.endpoint}, ${input.requestHash},
            ${input.now.toISOString()}::timestamptz,
            ${input.lockedUntil.toISOString()}::timestamptz,
            ${input.expiresAt.toISOString()}::timestamptz
          )
      `),
    );
    const row = result.rows[0];
    switch (row?.result) {
      case 'reserved':
      case 'conflict':
      case 'in_progress':
        return { result: row.result };
      case 'replay':
        return { result: 'replay', statusCode: row.stored_status ?? 200, body: row.stored_body };
      default:
        throw new Error('idempotency_reserve beklenmeyen sonuç döndürdü');
    }
  }

  /** Yanıtı saklar; kayıt başka bir istek tarafından devralındıysa false döner. */
  async complete(lock: IdempotencyLock, statusCode: number, body: unknown): Promise<boolean> {
    const json = JSON.stringify(body ?? null);
    const result = await withSystemTx((tx) =>
      tx.execute<{ completed: boolean }>(sql`
        select idempotency_complete(
          ${lock.key}, ${lock.userId}::uuid, ${lock.requestHash},
          ${lock.lockedUntil.toISOString()}::timestamptz, ${statusCode}, ${json}::jsonb
        ) as completed
      `),
    );
    return result.rows[0]?.completed === true;
  }

  async release(lock: IdempotencyLock): Promise<void> {
    await withSystemTx((tx) =>
      tx.execute(sql`
        select idempotency_release(
          ${lock.key}, ${lock.userId}::uuid, ${lock.requestHash},
          ${lock.lockedUntil.toISOString()}::timestamptz
        )
      `),
    );
  }

  /**
   * Telefon kapsamlı arama (F2.3a, R13): kullanıcı yok → `new`; aynı anahtar + aynı istek →
   * saklanan yanıt; aynı anahtar + farklı istek → `conflict`; aksi → `registered`.
   */
  async lookupByPhone(input: PhoneLookupInput): Promise<PhoneLookupResult> {
    const result = await withSystemTx((tx) =>
      tx.execute<ReserveRow>(sql`
        select result, stored_status, stored_body
          from idempotency_lookup_by_phone(
            ${input.phoneE164}, ${input.key ?? null}, ${input.endpoint}, ${input.requestHash},
            ${input.now.toISOString()}::timestamptz
          )
      `),
    );
    const row = result.rows[0];
    switch (row?.result) {
      case 'new':
      case 'registered':
      case 'conflict':
        return { result: row.result };
      case 'replay':
        return { result: 'replay', statusCode: row.stored_status ?? 200, body: row.stored_body };
      default:
        throw new Error('idempotency_lookup_by_phone beklenmeyen sonuç döndürdü');
    }
  }

  /**
   * Tamamlanmış yanıtı çağıranın işleminde yazar (R12 çözümü, F2.3a): işlem geri alınırsa yanıt
   * da yoktur. Kullanıcı işlem bağlamından (app.user_id).
   */
  async storeTx(tx: Tx, input: StoreInput): Promise<void> {
    const json = JSON.stringify(input.body ?? null);
    await tx.execute(sql`
      select idempotency_store(
        ${input.key}, ${input.endpoint}, ${input.requestHash}, ${input.statusCode},
        ${json}::jsonb, ${input.expiresAt.toISOString()}::timestamptz
      )
    `);
  }
}
