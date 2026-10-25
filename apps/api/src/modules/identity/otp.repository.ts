// `otp_challenges` (S) erişimi yalnızca SECURITY DEFINER fonksiyonlarla (drizzle/0007_identity.sql).
// İstek henüz kullanıcı bağlamına girmediği için bağlamsız sistem işlemi kullanılır (withSystemTx).
import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { type Tx, withSystemTx } from '../../core/db';
import type { OtpPurpose } from './identity.schema';

export interface CreateChallengeInput {
  readonly id: string;
  readonly phoneE164: string;
  readonly purpose: OtpPurpose;
  readonly codeHash: string;
  readonly expiresAt: Date;
  readonly requestIp: string | null;
  readonly now: Date;
}

export interface LockedChallenge {
  readonly phoneE164: string;
  readonly purpose: OtpPurpose;
  readonly codeHash: string;
  readonly expiresAt: Date;
  readonly attempts: number;
  readonly consumedAt: Date | null;
}

/** Kilitli challenge üzerinde aynı işlemde yapılabilenler. */
export interface ChallengeTx {
  readonly tx: Tx;
  /** Yanlış denemeyi sayar; yeni deneme sayısı. */
  fail(): Promise<number>;
  /** Challenge'ı kapatır (bir daha kullanılamaz). */
  close(): Promise<void>;
}

interface LockRow extends Record<string, unknown> {
  phone_e164: string;
  purpose: string;
  code_hash: string;
  expires_at: Date | string;
  attempts: number;
  consumed_at: Date | string | null;
}

@Injectable()
export class OtpRepository {
  async create(input: CreateChallengeInput): Promise<void> {
    await withSystemTx((tx) =>
      tx.execute(sql`
        select otp_challenge_create(
          ${input.id}::uuid, ${input.phoneE164}, ${input.purpose}, ${input.codeHash},
          ${input.expiresAt.toISOString()}::timestamptz, ${input.requestIp}::inet,
          ${input.now.toISOString()}::timestamptz
        )
      `),
    );
  }

  async close(id: string, now: Date): Promise<void> {
    await withSystemTx((tx) => closeChallenge(tx, id, now));
  }

  /**
   * Challenge satırını işlem boyunca kilitler (FOR UPDATE) ve fn'i çağırır; aynı anda gelen
   * doğrulamalar sırayla işlenir. Challenge yoksa fn `undefined` alır. fn hata atarsa işlem
   * geri alınır: sayılması gereken deneme için fn hata atmamalı, sonucu dönmelidir.
   */
  async withLockedChallenge<T>(
    id: string,
    now: Date,
    fn: (challenge: LockedChallenge | undefined, ops: ChallengeTx) => Promise<T>,
  ): Promise<T> {
    return await withSystemTx(async (tx) => {
      const result = await tx.execute<LockRow>(sql`
        select phone_e164, purpose, code_hash, expires_at, attempts, consumed_at
          from otp_challenge_lock(${id}::uuid)
      `);
      const row = result.rows[0];
      const challenge: LockedChallenge | undefined =
        row === undefined
          ? undefined
          : {
              phoneE164: row.phone_e164,
              purpose: row.purpose as OtpPurpose,
              codeHash: row.code_hash,
              expiresAt: new Date(row.expires_at),
              attempts: row.attempts,
              consumedAt: row.consumed_at === null ? null : new Date(row.consumed_at),
            };
      const ops: ChallengeTx = {
        tx,
        fail: async () => {
          const failed = await tx.execute<{ attempts: number }>(sql`
            select otp_challenge_fail(${id}::uuid, ${now.toISOString()}::timestamptz) as attempts
          `);
          return failed.rows[0]?.attempts ?? 0;
        },
        close: () => closeChallenge(tx, id, now),
      };
      return await fn(challenge, ops);
    });
  }
}

async function closeChallenge(tx: Tx, id: string, now: Date): Promise<void> {
  await tx.execute(sql`select otp_challenge_close(${id}::uuid, ${now.toISOString()}::timestamptz)`);
}
