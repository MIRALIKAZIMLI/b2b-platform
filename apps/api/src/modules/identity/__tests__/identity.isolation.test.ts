// F1.5-AC10: `users` U sınıfı (kullanıcı yalnızca kendi satırını görür ve günceller), S tabloları
// (`otp_challenges`, `dev_sms_outbox`) app_user'a kapalı. Gerçek PostgreSQL, app_user.
// check-rls denetimi: core/db/__tests__/check-rls.int.test.ts (F1.5-AC10).
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { pgErrorCode, PG_INSUFFICIENT_PRIVILEGE } from '../../../../test/isolation';
import { insertTestUsers, randomTestPhone } from '../../../../test/users';
import { withPlatformTx, withSystemTx, withTenantTx } from '../../../core/db';

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
});
