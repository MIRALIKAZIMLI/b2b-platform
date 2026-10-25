// `dev_sms_outbox` (S) erişimi yalnızca SECURITY DEFINER fonksiyonlarla (drizzle/0007_identity.sql).
// Tablo yalnızca mock sağlayıcı kullanılırken dolar (NFR-96); okuma yalnızca dev modülünden.
import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { withSystemTx } from '../../core/db';

export interface DevSmsMessage {
  readonly id: string;
  readonly phone: string;
  readonly body: string;
  readonly createdAt: Date;
}

interface OutboxRow extends Record<string, unknown> {
  id: string;
  phone_e164: string;
  body: string;
  created_at: Date | string;
}

@Injectable()
export class DevSmsOutboxRepository {
  async insert(input: { id: string; phone: string; body: string; now: Date }): Promise<void> {
    await withSystemTx((tx) =>
      tx.execute(sql`
        select dev_sms_outbox_insert(
          ${input.id}::uuid, ${input.phone}, ${input.body}, ${input.now.toISOString()}::timestamptz
        )
      `),
    );
  }

  /** En yeni önce; `phone` verilmezse tüm numaralar. */
  async list(phone: string | undefined, limit: number): Promise<DevSmsMessage[]> {
    const result = await withSystemTx((tx) =>
      tx.execute<OutboxRow>(sql`
        select id, phone_e164, body, created_at
          from dev_sms_outbox_list(${phone ?? null}::text, ${limit}::integer)
      `),
    );
    return result.rows.map((row) => ({
      id: row.id,
      phone: row.phone_e164,
      body: row.body,
      createdAt: new Date(row.created_at),
    }));
  }
}
