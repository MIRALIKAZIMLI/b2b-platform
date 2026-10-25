// `user_totp` (U) ve `platform_staff` (S) erişimi (F1.6, drizzle/0009_totp_platform_staff.sql).
// user_totp: kullanıcının kendi bağlamında (withUserTx), RLS altında; doğrulamada satır kilitlenir.
// platform_staff: yalnızca platform_staff_role() SECURITY DEFINER fonksiyonuyla.
import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { type Tx, withSystemTx, withUserTx } from '../../../core/db';
import {
  PLATFORM_ROLES,
  type PlatformRole,
  type RecoveryCodeHash,
  userTotp,
} from '../identity.schema';

export interface TotpRow {
  readonly secretEncrypted: Buffer;
  readonly recoveryCodes: readonly RecoveryCodeHash[];
  readonly enabledAt: Date | null;
  readonly lastUsedStep: number | null;
}

/** Kilitli satır üzerinde aynı işlemde yapılabilenler. */
export interface TotpTx {
  saveSecret(secretEncrypted: Buffer): Promise<void>;
  enable(recoveryCodes: readonly RecoveryCodeHash[], step: number): Promise<void>;
  recordStep(step: number): Promise<void>;
  useRecoveryCodes(recoveryCodes: readonly RecoveryCodeHash[]): Promise<void>;
}

interface TotpDbRow extends Record<string, unknown> {
  secret_encrypted: Buffer;
  recovery_codes_hash: RecoveryCodeHash[];
  enabled_at: Date | string | null;
  last_used_step: string | number | null;
}

function isPlatformRole(value: unknown): value is PlatformRole {
  return typeof value === 'string' && (PLATFORM_ROLES as readonly string[]).includes(value);
}

@Injectable()
export class TotpRepository {
  /** Aktif platform rolü; yoksa undefined. */
  async platformRole(userId: string): Promise<PlatformRole | undefined> {
    const result = await withSystemTx((tx) =>
      tx.execute<{ role: string | null }>(sql`select platform_staff_role(${userId}::uuid) as role`),
    );
    const role = result.rows[0]?.role;
    return isPlatformRole(role) ? role : undefined;
  }

  /** TOTP etkin mi (`/me`, giriş akışı). */
  async isEnabled(userId: string): Promise<boolean> {
    const result = await withUserTx({ userId }, (tx) =>
      tx.execute<{ enabled: boolean }>(
        sql`select enabled_at is not null as enabled from user_totp where user_id = ${userId}::uuid`,
      ),
    );
    return result.rows[0]?.enabled === true;
  }

  /**
   * Satırı işlem boyunca kilitler (FOR UPDATE) ve fn'i çağırır: aynı koda eşzamanlı iki doğrulama
   * sıralanır. fn hata atarsa işlem geri alınır.
   */
  async withLocked<T>(
    userId: string,
    now: Date,
    fn: (row: TotpRow | undefined, ops: TotpTx) => Promise<T>,
  ): Promise<T> {
    return await withUserTx({ userId }, async (tx) => {
      const result = await tx.execute<TotpDbRow>(sql`
        select secret_encrypted, recovery_codes_hash, enabled_at, last_used_step
          from user_totp where user_id = ${userId}::uuid for update
      `);
      const raw = result.rows[0];
      const row: TotpRow | undefined =
        raw === undefined
          ? undefined
          : {
              secretEncrypted: Buffer.from(raw.secret_encrypted),
              recoveryCodes: raw.recovery_codes_hash,
              enabledAt: raw.enabled_at === null ? null : new Date(raw.enabled_at),
              lastUsedStep: raw.last_used_step === null ? null : Number(raw.last_used_step),
            };
      return await fn(row, opsFor(tx, userId, now, raw !== undefined));
    });
  }
}

function opsFor(tx: Tx, userId: string, now: Date, exists: boolean): TotpTx {
  const where = eq(userTotp.userId, userId);
  return {
    saveSecret: async (secretEncrypted) => {
      if (exists) {
        await tx
          .update(userTotp)
          .set({ secretEncrypted, recoveryCodesHash: [], enabledAt: null, updatedAt: now })
          .where(where);
      } else {
        await tx.insert(userTotp).values({
          userId,
          secretEncrypted,
          recoveryCodesHash: [],
          createdAt: now,
          updatedAt: now,
        });
      }
    },
    enable: async (recoveryCodes, step) => {
      await tx
        .update(userTotp)
        .set({
          recoveryCodesHash: [...recoveryCodes],
          enabledAt: now,
          lastUsedStep: step,
          updatedAt: now,
        })
        .where(where);
    },
    recordStep: async (step) => {
      await tx.update(userTotp).set({ lastUsedStep: step, updatedAt: now }).where(where);
    },
    useRecoveryCodes: async (recoveryCodes) => {
      await tx
        .update(userTotp)
        .set({ recoveryCodesHash: [...recoveryCodes], updatedAt: now })
        .where(where);
    },
  };
}
