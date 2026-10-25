// F1.5-AC10: `users` U sınıfı (kullanıcı yalnızca kendi satırını görür ve günceller), S tabloları
// (`otp_challenges`, `dev_sms_outbox`) app_user'a kapalı. F1.5-AC14: `user_sessions` U sınıfı. Gerçek PostgreSQL, app_user.
// check-rls denetimi: core/db/__tests__/check-rls.int.test.ts (F1.5-AC10).
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { connectAsAppUser } from '../../../../test/db-clients';
import { pgErrorCode, PG_INSUFFICIENT_PRIVILEGE } from '../../../../test/isolation';
import { insertTestUsers, randomTestPhone } from '../../../../test/users';
import { withPlatformTx, withSystemTx, withTenantTx, withUserTx } from '../../../core/db';

async function errorOf(promise: Promise<unknown>): Promise<unknown> {
  return await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
}

describe('kimlik tabloları izolasyonu (identity)', () => {
  const userA = randomUUID();
  const userB = randomUUID();
  // users kiracıya değil kullanıcıya bağlıdır; işletme bağlamı politikayı etkilemez.
  const asA = { businessId: randomUUID(), userId: userA };
  const asB = { businessId: randomUUID(), userId: userB };

  beforeAll(async () => {
    await insertTestUsers(userA, userB);
  });

  it('F1.5-AC10: kullanıcı A yalnızca kendi satırını görür', async () => {
    const rows = await withTenantTx(asA, (tx) =>
      tx.execute<{ id: string }>(sql`select id from users where id in (${userA}, ${userB})`),
    );
    expect(rows.rows).toEqual([{ id: userA }]);

    const rowsB = await withTenantTx(asB, (tx) =>
      tx.execute<{ id: string }>(sql`select id from users where id in (${userA}, ${userB})`),
    );
    expect(rowsB.rows).toEqual([{ id: userB }]);
  });

  it('F1.5-AC10: bağlamsız işlem hiçbir kullanıcıyı görmez', async () => {
    const rows = await withSystemTx((tx) =>
      tx.execute(sql`select id from users where id in (${userA}, ${userB})`),
    );
    expect(rows.rows).toEqual([]);
  });

  it("F1.5-AC10: A, B'nin satırını güncelleyemez; kendi satırını güncelleyebilir", async () => {
    const foreign = await withTenantTx(asA, (tx) =>
      tx.execute(sql`update users set full_name = 'X' where id = ${userB}`),
    );
    expect(foreign.rowCount).toBe(0);

    const own = await withTenantTx(asA, (tx) =>
      tx.execute(sql`update users set full_name = 'A' where id = ${userA}`),
    );
    expect(own.rowCount).toBe(1);
  });

  it('F1.5-AC10: A kendi satırının kimliğini başka kullanıcıya çeviremez (WITH CHECK)', async () => {
    const error = await errorOf(
      withTenantTx(asA, (tx) =>
        tx.execute(sql`update users set id = ${randomUUID()} where id = ${userA}`),
      ),
    );
    expect(pgErrorCode(error)).toBe(PG_INSUFFICIENT_PRIVILEGE);
  });

  it('F1.5-AC10: kullanıcı kendi status / phone_e164 / last_login_at alanını değiştiremez → 42501', async () => {
    const statements = [
      sql`update users set status = 'locked' where id = ${userA}`,
      sql`update users set phone_e164 = ${randomTestPhone()} where id = ${userA}`,
      sql`update users set last_login_at = now() where id = ${userA}`,
    ];
    for (const statement of statements) {
      const error = await errorOf(withTenantTx(asA, (tx) => tx.execute(statement)));
      expect(pgErrorCode(error)).toBe(PG_INSUFFICIENT_PRIVILEGE);
    }
  });

  it('F1.5-AC10: kullanıcı kendi full_name alanını değiştirebilir', async () => {
    const result = await withTenantTx(asA, (tx) =>
      tx.execute(sql`update users set full_name = 'Yeni Ad' where id = ${userA}`),
    );
    expect(result.rowCount).toBe(1);
  });

  it('F1.5-AC10: platform status ve last_login_at değiştirebilir', async () => {
    const result = await withPlatformTx({ userId: userA }, (tx) =>
      tx.execute(
        sql`update users set status = 'locked', last_login_at = now() where id = ${userB}`,
      ),
    );
    expect(result.rowCount).toBe(1);
    const row = await withPlatformTx({ userId: userA }, (tx) =>
      tx.execute<{ status: string }>(sql`select status from users where id = ${userB}`),
    );
    expect(row.rows).toEqual([{ status: 'locked' }]);
    await withPlatformTx({ userId: userA }, (tx) =>
      tx.execute(sql`update users set status = 'active' where id = ${userB}`),
    );
  });

  it('F1.5-AC10: kiracı bağlamında kullanıcı eklenemez ve silinemez', async () => {
    const insert = await errorOf(
      withTenantTx(asA, (tx) =>
        tx.execute(sql`insert into users (id, phone_e164, full_name)
                       values (${randomUUID()}, ${randomTestPhone()}, 'X')`),
      ),
    );
    expect(pgErrorCode(insert)).toBe(PG_INSUFFICIENT_PRIVILEGE);

    const remove = await errorOf(
      withTenantTx(asA, (tx) => tx.execute(sql`delete from users where id = ${userA}`)),
    );
    expect(pgErrorCode(remove)).toBe(PG_INSUFFICIENT_PRIVILEGE);
  });

  it('F1.5-AC10: platform bağlamı iki kullanıcıyı da görür', async () => {
    const rows = await withPlatformTx({ userId: userA }, (tx) =>
      tx.execute<{ id: string }>(
        sql`select id from users where id in (${userA}, ${userB}) order by id`,
      ),
    );
    expect(rows.rows.map((row) => row.id).sort()).toEqual([userA, userB].sort());
  });

  it('F1.5-AC10: app_user otp_challenges ve dev_sms_outbox tablolarını doğrudan okuyamaz/yazamaz', async () => {
    const statements = [
      sql`select * from otp_challenges`,
      sql`select * from dev_sms_outbox`,
      sql`insert into dev_sms_outbox (id, phone_e164, body) values (${randomUUID()}, '+994501234567', 'x')`,
      sql`update otp_challenges set attempts = 0`,
    ];
    for (const statement of statements) {
      const error = await errorOf(withPlatformTx({ userId: userA }, (tx) => tx.execute(statement)));
      expect(pgErrorCode(error)).toBe(PG_INSUFFICIENT_PRIVILEGE);
    }
  });

  describe('user_sessions (F1.5-AC14)', () => {
    const sessionA = randomUUID();
    const sessionB = randomUUID();

    function insertSession(userId: string, id: string) {
      return withUserTx({ userId }, (tx) =>
        tx.execute(sql`insert into user_sessions
                         (id, user_id, refresh_token_hash, family_id, device_type, last_used_at, expires_at)
                       values (${id}, ${userId}, ${randomUUID()}, ${randomUUID()}, 'web', now(),
                               now() + interval '30 days')`),
      );
    }

    beforeAll(async () => {
      await insertSession(userA, sessionA);
      await insertSession(userB, sessionB);
    });

    it('F1.5-AC14: kullanıcı yalnızca kendi oturumlarını görür', async () => {
      const rows = await withUserTx({ userId: userA }, (tx) =>
        tx.execute<{ id: string }>(
          sql`select id from user_sessions where id in (${sessionA}, ${sessionB})`,
        ),
      );
      expect(rows.rows).toEqual([{ id: sessionA }]);
    });

    it("F1.5-AC14: A, B'nin oturumunu kapatamaz (0 satır)", async () => {
      const result = await withUserTx({ userId: userA }, (tx) =>
        tx.execute(sql`update user_sessions set revoked_at = now() where id = ${sessionB}`),
      );
      expect(result.rowCount).toBe(0);
    });

    it('F1.5-AC14: başka kullanıcı adına oturum eklenemez → 42501', async () => {
      const error = await errorOf(
        insertSession(userB, randomUUID()).then(() =>
          withUserTx({ userId: userA }, (tx) =>
            tx.execute(sql`insert into user_sessions
                           (id, user_id, refresh_token_hash, family_id, device_type, last_used_at, expires_at)
                         values (${randomUUID()}, ${userB}, ${randomUUID()}, ${randomUUID()}, 'web',
                                 now(), now())`),
          ),
        ),
      );
      expect(pgErrorCode(error)).toBe(PG_INSUFFICIENT_PRIVILEGE);
    });

    it('F1.5-AC14: kullanıcı oturumunun anahtar özetini, süresini değiştiremez; kapatılmış oturumu açamaz → 42501', async () => {
      const own = randomUUID();
      await insertSession(userA, own);
      for (const statement of [
        sql`update user_sessions set refresh_token_hash = ${randomUUID()} where id = ${own}`,
        sql`update user_sessions set expires_at = now() + interval '365 days' where id = ${own}`,
      ]) {
        const error = await errorOf(withUserTx({ userId: userA }, (tx) => tx.execute(statement)));
        expect(pgErrorCode(error)).toBe(PG_INSUFFICIENT_PRIVILEGE);
      }
      await withUserTx({ userId: userA }, (tx) =>
        tx.execute(
          sql`update user_sessions set revoked_at = now(), updated_at = now() where id = ${own}`,
        ),
      );
      const reopen = await errorOf(
        withUserTx({ userId: userA }, (tx) =>
          tx.execute(sql`update user_sessions set revoked_at = null where id = ${own}`),
        ),
      );
      expect(pgErrorCode(reopen)).toBe(PG_INSUFFICIENT_PRIVILEGE);
    });

    it('F1.5-AC14: kiracı ve bağlamsız işlem başkasının oturumunu görmez; platform görür', async () => {
      const system = await withSystemTx((tx) =>
        tx.execute(sql`select id from user_sessions where id in (${sessionA}, ${sessionB})`),
      );
      expect(system.rows).toEqual([]);
      const tenant = await withTenantTx(asA, (tx) =>
        tx.execute<{ id: string }>(
          sql`select id from user_sessions where id in (${sessionA}, ${sessionB})`,
        ),
      );
      expect(tenant.rows).toEqual([{ id: sessionA }]);
      const platform = await withPlatformTx({ userId: userA }, (tx) =>
        tx.execute(sql`select id from user_sessions where id in (${sessionA}, ${sessionB})`),
      );
      expect(platform.rows).toHaveLength(2);
    });

    it('F1.5-AC14: app_user migrator rolünü üstlenemez (definer politikaları sızmaz)', async () => {
      const client = await connectAsAppUser();
      try {
        const member = await client.query<{ member: boolean }>(
          "select pg_has_role('app_user', 'migrator', 'MEMBER') as member",
        );
        expect(member.rows[0]?.member).toBe(false);
        const error = await errorOf(client.query('set role migrator'));
        expect(pgErrorCode(error)).toBe(PG_INSUFFICIENT_PRIVILEGE);
        // TO migrator politikaları app_user için geçerli değil: bağlamsız okuma 0 satır.
        const rows = await client.query('select id from user_sessions where id = any($1::uuid[])', [
          [sessionA, sessionB],
        ]);
        expect(rows.rows).toEqual([]);
      } finally {
        await client.end();
      }
    });

    it('F1.5-AC14: user_sessions silinemez → 42501', async () => {
      const error = await errorOf(
        withUserTx({ userId: userA }, (tx) =>
          tx.execute(sql`delete from user_sessions where id = ${sessionA}`),
        ),
      );
      expect(pgErrorCode(error)).toBe(PG_INSUFFICIENT_PRIVILEGE);
    });
  });
});
