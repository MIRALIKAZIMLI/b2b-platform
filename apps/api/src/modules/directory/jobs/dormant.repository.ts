// Bağlantısız hesap gece işinin veritabanı erişimi (F2.17). Yalnız bağlamsız sistem işleminde
// (`withSystemTx`) migrator sahipli SECURITY DEFINER fonksiyonlarla (0030); başka yol yok.
import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Tx } from '../../../core/db';
import { DORMANT_STAGES, type DormantStage, type DormantState } from './dormant-policy';

export interface DormantRow extends DormantState {
  readonly businessId: string;
}

export interface DormantRecipient {
  readonly userId: string;
  /** Alıcının işletmesi (perakendeci adminlerinde perakendeci, bölge toptancılarında toptancı). */
  readonly businessId: string;
}

export interface DormantArchiveResult {
  /** `purged` = geçmişsiz kayıt kalıcı silindi (S1 = B); `archived`; `skipped` = uygun değil. */
  readonly outcome: 'purged' | 'archived' | 'skipped';
  readonly personRows: number;
  readonly invitationsClosed: number;
  /** Kalıcı silmede silinen dosyaların depo anahtarları. */
  readonly objectKeys: readonly string[];
}

function archiveOutcome(value: string | undefined): DormantArchiveResult['outcome'] {
  return value === 'purged' || value === 'archived' ? value : 'skipped';
}

function isStage(value: string): value is DormantStage {
  return (DORMANT_STAGES as readonly string[]).includes(value);
}

function epochDate(value: number | string | null): Date | null {
  return value === null ? null : new Date(Number(value));
}

@Injectable()
export class DormantRepository {
  /** Kimliği `after`'dan büyük uygun perakendeciler (satırlar işlem sonuna dek kilitli). */
  async scanTx(
    tx: Tx,
    now: Date,
    after: string | null,
    minDays: number,
    limit: number,
  ): Promise<DormantRow[]> {
    const result = await tx.execute<{
      business_id: string;
      status: string;
      stage: string;
      stage_at_ms: number | string | null;
      since_ms: number | string;
    }>(
      sql`select business_id, status, stage,
                 (extract(epoch from stage_at) * 1000)::float8 as stage_at_ms,
                 (extract(epoch from since) * 1000)::float8 as since_ms
            from dormant_scan(${now.toISOString()}::timestamptz, ${after}::uuid,
                              ${minDays}::int, ${limit}::int)`,
    );
    return result.rows.map((row) => {
      if (!isStage(row.stage) || (row.status !== 'active' && row.status !== 'dormant')) {
        throw new Error('dormant_scan: beklenmeyen satır');
      }
      return {
        businessId: row.business_id,
        status: row.status,
        stage: row.stage,
        stageAt: epochDate(row.stage_at_ms),
        since: epochDate(row.since_ms) ?? now,
      };
    });
  }

  async advanceTx(tx: Tx, businessId: string, stage: string, now: Date): Promise<boolean> {
    const result = await tx.execute<{ advanced: boolean }>(
      sql`select dormant_advance(${businessId}::uuid, ${stage}::text,
                                 ${now.toISOString()}::timestamptz) as advanced`,
    );
    return result.rows[0]?.advanced === true;
  }

  async archiveTx(tx: Tx, businessId: string, now: Date): Promise<DormantArchiveResult> {
    const result = await tx.execute<{
      outcome: string;
      person_rows: number;
      invitations_closed: number;
      object_keys: string[] | null;
    }>(
      sql`select outcome, person_rows, invitations_closed, object_keys
            from dormant_archive(${businessId}::uuid, ${now.toISOString()}::timestamptz)`,
    );
    const row = result.rows[0];
    return {
      outcome: archiveOutcome(row?.outcome),
      personRows: row?.person_rows ?? 0,
      invitationsClosed: row?.invitations_closed ?? 0,
      objectKeys: row?.object_keys ?? [],
    };
  }

  async recipientsTx(
    tx: Tx,
    businessId: string,
    kind: 'buyer_admins' | 'region_sellers',
  ): Promise<DormantRecipient[]> {
    const result = await tx.execute<{ user_id: string; business_id: string }>(
      sql`select user_id, business_id from dormant_recipients(${businessId}::uuid, ${kind}::text)`,
    );
    return result.rows.map((row) => ({ userId: row.user_id, businessId: row.business_id }));
  }
}
