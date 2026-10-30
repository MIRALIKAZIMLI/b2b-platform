// F1.11-AC7: U tabloları izolasyonu (push_tokens, notifications, notification_preferences).
// Kullanıcı başkasının token, bildirim ve tercihini göremez ve değiştiremez; token yalnızca
// push_token_register ile eklenir/taşınır. check-rls denetimi: core/db/__tests__/check-rls.int.test.ts.
// Gerçek PostgreSQL, app_user. SECURITY DEFINER search_path denetimi: security-definer.int.test.ts.
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { pgErrorCode, PG_INSUFFICIENT_PRIVILEGE } from '../../../../test/isolation';
import { withSystemTx, withTenantTx, withUserTx } from '../../../core/db';
import { NotificationsRepository } from '../notifications.repository';
import { expoToken, insertRecipient, registerToken, runNotificationSeed } from './fixtures';

async function errorOf(promise: Promise<unknown>): Promise<unknown> {
  return await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
}

const TABLES = ['push_tokens', 'notifications', 'notification_preferences'] as const;

describe('bildirim tabloları izolasyonu (notifications)', () => {
  const repo = new NotificationsRepository();
  const now = new Date('2026-10-30T09:00:00.000Z');
  let userA: string;
  let userB: string;
  let tokenB: string;
  let notificationB: string;

  beforeAll(async () => {
    await runNotificationSeed();
    userA = (await insertRecipient('az')).id;
    userB = (await insertRecipient('az')).id;
    await registerToken(repo, userA, expoToken());
    tokenB = expoToken();
    await registerToken(repo, userB, tokenB);
    notificationB = randomUUID();
    await withUserTx({ userId: userB }, async (tx) => {
      await repo.insert(tx, {
        id: notificationB,
        userId: userB,
        businessId: null,
        type: 'test',
        payload: { id: randomUUID(), params: {} },
        now,
      });
      await repo.upsertPreference(tx, userB, 'test', false, now);
    });
    await withUserTx({ userId: userA }, (tx) =>
      repo.insert(tx, {
        id: randomUUID(),
        userId: userA,
        businessId: null,
        type: 'test',
        payload: { id: randomUUID(), params: {} },
        now,
      }),
    );
  });

  it('F1.11-AC7: A yalnızca kendi token, bildirim ve tercih satırlarını görür', async () => {
    for (const table of TABLES) {
      const rows = await withUserTx({ userId: userA }, (tx) =>
        tx.execute<{ user_id: string }>(sql`select user_id::text from ${sql.identifier(table)}`),
      );
      expect(
        rows.rows.every((row) => row.user_id === userA),
        table,
      ).toBe(true);
    }
    const prefsA = await withUserTx({ userId: userA }, (tx) => repo.preferences(tx));
    expect(prefsA.size).toBe(0);
  });

  it('F1.11-AC7: işletme bağlamı ve bağlamsız işlem başkasının satırını görmez', async () => {
    for (const table of TABLES) {
      const tenant = await withTenantTx({ businessId: randomUUID(), userId: userA }, (tx) =>
        tx.execute<{ user_id: string }>(sql`select user_id::text from ${sql.identifier(table)}`),
      );
      expect(
        tenant.rows.some((row) => row.user_id === userB),
        table,
      ).toBe(false);
      const system = await withSystemTx((tx) =>
        tx.execute(sql`select 1 from ${sql.identifier(table)}`),
      );
      expect(system.rows, table).toEqual([]);
    }
  });

  it("F1.11-AC7: A, B'nin bildirimini okundu yapamaz, tercihini ve token'ını değiştiremez", async () => {
    await withUserTx({ userId: userA }, (tx) => repo.markRead(tx, [notificationB], now));
    const update = await withUserTx({ userId: userA }, (tx) =>
      tx.execute(
        sql`update notification_preferences set push_enabled = true where user_id = ${userB}::uuid`,
      ),
    );
    const tokenIdsB = (await withUserTx({ userId: userB }, (tx) => repo.tokens(tx))).map(
      (row) => row.id,
    );
    const removed = await withUserTx({ userId: userA }, (tx) => repo.deleteTokens(tx, tokenIdsB));

    expect(update.rowCount).toBe(0);
    expect(removed).toBe(0);
    const stillUnread = await withUserTx({ userId: userB }, (tx) =>
      repo.findById(tx, notificationB),
    );
    expect(stillUnread?.readAt).toBeNull();
    const prefsB = await withUserTx({ userId: userB }, (tx) => repo.preferences(tx));
    expect(prefsB.get('test')).toBe(false);
    const tokensB = await withUserTx({ userId: userB }, (tx) => repo.tokens(tx));
    expect(tokensB.map((row) => row.token)).toEqual([tokenB]);
  });

  it('F1.11-AC7: A, B adına bildirim veya tercih yazamaz (WITH CHECK → 42501)', async () => {
    const notification = await errorOf(
      withUserTx({ userId: userA }, (tx) =>
        repo.insert(tx, {
          id: randomUUID(),
          userId: userB,
          businessId: null,
          type: 'test',
          payload: { id: randomUUID(), params: {} },
          now,
        }),
      ),
    );
    const preference = await errorOf(
      withUserTx({ userId: userA }, (tx) => repo.upsertPreference(tx, userB, 'test', true, now)),
    );
    expect(pgErrorCode(notification)).toBe(PG_INSUFFICIENT_PRIVILEGE);
    expect(pgErrorCode(preference)).toBe(PG_INSUFFICIENT_PRIVILEGE);
  });

  it('F1.11-AC7: bildirimde yalnızca read_at güncellenir; token tablosuna doğrudan yazılamaz', async () => {
    const payload = await errorOf(
      withUserTx({ userId: userA }, (tx) =>
        tx.execute(sql`update notifications set type = 'x' where user_id = ${userA}::uuid`),
      ),
    );
    const insertToken = await errorOf(
      withUserTx({ userId: userA }, (tx) =>
        tx.execute(sql`
          insert into push_tokens (id, user_id, token, platform, last_seen_at)
          values (${randomUUID()}::uuid, ${userA}::uuid, ${expoToken()}, 'ios', now())
        `),
      ),
    );
    const moveToken = await errorOf(
      withUserTx({ userId: userA }, (tx) =>
        tx.execute(
          sql`update push_tokens set user_id = ${userB}::uuid where user_id = ${userA}::uuid`,
        ),
      ),
    );
    expect(pgErrorCode(payload)).toBe(PG_INSUFFICIENT_PRIVILEGE);
    expect(pgErrorCode(insertToken)).toBe(PG_INSUFFICIENT_PRIVILEGE);
    expect(pgErrorCode(moveToken)).toBe(PG_INSUFFICIENT_PRIVILEGE);
  });

  it('F1.11-AC7: notifications.business_id elle eklenen FK ile businesses tablosuna bağlı (23503)', async () => {
    const error = await errorOf(
      withUserTx({ userId: userA }, (tx) =>
        repo.insert(tx, {
          id: randomUUID(),
          userId: userA,
          businessId: randomUUID(),
          type: 'test',
          payload: { id: randomUUID(), params: {} },
          now,
        }),
      ),
    );
    expect(pgErrorCode(error)).toBe('23503');
  });

  it('F1.11-AC7: push_token_register kullanıcı bağlamı olmadan çalışmaz (42501)', async () => {
    const error = await errorOf(
      withSystemTx((tx) =>
        repo.registerToken(tx, { id: randomUUID(), token: expoToken(), platform: 'ios', now }),
      ),
    );
    expect(pgErrorCode(error)).toBe(PG_INSUFFICIENT_PRIVILEGE);
  });

  it("F1.11-AC7: aynı token başka kullanıcıya kaydedilince A'dan kalkar, B'ye geçer", async () => {
    const token = expoToken();
    await registerToken(repo, userA, token);
    await registerToken(repo, userB, token);

    const tokensA = await withUserTx({ userId: userA }, (tx) => repo.tokens(tx));
    const tokensB = await withUserTx({ userId: userB }, (tx) => repo.tokens(tx));
    expect(tokensA.some((row) => row.token === token)).toBe(false);
    expect(tokensB.some((row) => row.token === token)).toBe(true);
  });
});
