// `user_sessions` (U) ve oturumla ilgili kullanıcı okumaları (F1.5b, drizzle/0008_user_sessions.sql).
// - Kullanıcı bağlamı olan işler (oturum açma, listeleme, kapatma) withUserTx ile RLS altında.
// - Kullanıcı bağlamı olmayan işler (numaradan kullanıcı, yenileme) SECURITY DEFINER fonksiyonlarla.
import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { type Tx, withSystemTx, withUserTx } from '../../core/db';
import { type DeviceType, type UserStatus, userSessions } from './identity.schema';

export interface UserRef {
  readonly id: string;
  readonly status: UserStatus;
}

export interface OpenSessionInput {
  readonly id: string;
  readonly userId: string;
  readonly familyId: string;
  readonly refreshTokenHash: string;
  readonly deviceType: DeviceType;
  readonly deviceName: string | null;
  readonly now: Date;
  readonly expiresAt: Date;
}

export interface RotateInput {
  readonly refreshTokenHash: string;
  readonly newId: string;
  readonly newRefreshTokenHash: string;
  readonly now: Date;
  readonly newExpiresAt: Date;
}

export type RotateResult =
  | {
      readonly result: 'rotated' | 'reused' | 'expired' | 'disabled';
      readonly userId: string;
      readonly sessionId: string;
      readonly familyId: string;
    }
  | { readonly result: 'unknown' };

export interface ActiveSession {
  readonly id: string;
  readonly deviceType: DeviceType;
  readonly deviceName: string | null;
  readonly ipCity: string | null;
  readonly lastUsedAt: Date;
}

export interface SelfUser {
  readonly id: string;
  readonly fullName: string;
  readonly phoneE164: string;
  readonly preferredLanguage: string | null;
  readonly timezone: string | null;
  readonly status: UserStatus;
}

interface SelfUserRow extends Record<string, unknown> {
  id: string;
  full_name: string;
  phone_e164: string;
  preferred_language: string | null;
  timezone: string | null;
  status: UserStatus;
}

interface RotateRow extends Record<string, unknown> {
  result: string;
  user_id: string | null;
  session_id: string | null;
  family_id: string | null;
}

interface SessionRow extends Record<string, unknown> {
  id: string;
  device_type: DeviceType;
  device_name: string | null;
  ip_city: string | null;
  last_used_at: Date | string;
}

const ROTATE_RESULTS = new Set(['rotated', 'reused', 'expired', 'disabled']);

@Injectable()
export class SessionRepository {
  async findUserByPhone(phoneE164: string): Promise<UserRef | undefined> {
    const result = await withSystemTx((tx) =>
      tx.execute<{ id: string; status: UserStatus }>(
        sql`select id, status from identity_user_by_phone(${phoneE164})`,
      ),
    );
    return result.rows[0];
  }

  /** Kullanıcının kendi satırı (RLS: yalnızca kendisi). */
  async findSelf(userId: string): Promise<SelfUser | undefined> {
    const result = await withUserTx({ userId }, (tx) =>
      tx.execute<SelfUserRow>(sql`
        select id, full_name, phone_e164, preferred_language, timezone, status
          from users where id = ${userId}::uuid
      `),
    );
    const row = result.rows[0];
    return row === undefined
      ? undefined
      : {
          id: row.id,
          fullName: row.full_name,
          phoneE164: row.phone_e164,
          preferredLanguage: row.preferred_language,
          timezone: row.timezone,
          status: row.status,
        };
  }

  /** Oturum açar ve `last_login_at` yazar (aynı işlem, kullanıcı bağlamı). */
  async open(input: OpenSessionInput): Promise<void> {
    await withUserTx({ userId: input.userId }, async (tx) => {
      await tx.insert(userSessions).values({
        id: input.id,
        userId: input.userId,
        refreshTokenHash: input.refreshTokenHash,
        familyId: input.familyId,
        deviceType: input.deviceType,
        deviceName: input.deviceName,
        ipCity: null,
        lastUsedAt: input.now,
        expiresAt: input.expiresAt,
        createdAt: input.now,
        updatedAt: input.now,
      });
      await tx.execute(
        sql`select identity_record_login(${input.userId}::uuid, ${input.now.toISOString()}::timestamptz)`,
      );
    });
  }

  /**
   * Yenileme anahtarını tek işlemde, satır kilidiyle döndürür. `onReused` aynı işlemde çağrılır
   * (audit); hata atarsa aile iptali de geri alınır.
   */
  async rotate(
    input: RotateInput,
    onReused: (tx: Tx, familyId: string) => Promise<void>,
  ): Promise<RotateResult> {
    return await withSystemTx(async (tx) => {
      const result = await tx.execute<RotateRow>(sql`
        select result, user_id, session_id, family_id
          from user_session_rotate(
            ${input.refreshTokenHash}, ${input.newId}::uuid, ${input.newRefreshTokenHash},
            ${input.now.toISOString()}::timestamptz, ${input.newExpiresAt.toISOString()}::timestamptz
          )
      `);
      const row = result.rows[0];
      if (row === undefined || row.result === 'unknown') return { result: 'unknown' };
      if (
        !ROTATE_RESULTS.has(row.result) ||
        row.user_id === null ||
        row.session_id === null ||
        row.family_id === null
      ) {
        throw new Error('user_session_rotate beklenmeyen sonuç döndürdü');
      }
      const rotated = {
        result: row.result as 'rotated' | 'reused' | 'expired' | 'disabled',
        userId: row.user_id,
        sessionId: row.session_id,
        familyId: row.family_id,
      };
      if (rotated.result === 'reused') await onReused(tx, rotated.familyId);
      return rotated;
    });
  }

  /** Kullanıcının açık oturumları (aile başına geçerli satır), son kullanım sırasıyla. */
  async listActive(userId: string, now: Date): Promise<ActiveSession[]> {
    const result = await withUserTx({ userId }, (tx) =>
      tx.execute<SessionRow>(sql`
        select id, device_type, device_name, ip_city, last_used_at
          from user_sessions
         where revoked_at is null and expires_at > ${now.toISOString()}::timestamptz
         order by last_used_at desc, id desc
      `),
    );
    return result.rows.map((row) => ({
      id: row.id,
      deviceType: row.device_type,
      deviceName: row.device_name,
      ipCity: row.ip_city,
      lastUsedAt: new Date(row.last_used_at),
    }));
  }

  /**
   * `sessionId` satırının ailesindeki açık satırları kapatır; kapatılan satır sayısı. RLS yüzünden
   * başka kullanıcının oturumu görünmez (0). `onlyIfActive`: satırın kendisi açık değilse dokunmaz.
   */
  async revokeFamily(
    userId: string,
    sessionId: string,
    now: Date,
    onlyIfActive: boolean,
  ): Promise<number> {
    const at = now.toISOString();
    const result = await withUserTx({ userId }, (tx) =>
      tx.execute(sql`
        update user_sessions
           set revoked_at = ${at}::timestamptz, updated_at = ${at}::timestamptz
         where revoked_at is null
           and family_id = (
             select s.family_id from user_sessions s
              where s.id = ${sessionId}::uuid
                and (${!onlyIfActive} or (s.revoked_at is null and s.expires_at > ${at}::timestamptz))
           )
      `),
    );
    return result.rowCount ?? 0;
  }
}
