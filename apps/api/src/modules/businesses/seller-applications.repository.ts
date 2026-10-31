import { Injectable } from '@nestjs/common';
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { type Tx, withSystemTx } from '../../core/db';
import { type SellerApplicationStatus, sellerApplications } from './businesses.schema';
import { SellerApplicationStateMachine } from './seller-application.state-machine';

export type SellerApplicationRow = typeof sellerApplications.$inferSelect;

/** Kimliksiz başvuru (US-008 AC1). Kimlik ve zaman çağırandan. */
export interface NewSellerApplication {
  readonly id: string;
  readonly legalName: string;
  readonly voen: string;
  readonly contactName: string;
  readonly phoneE164: string;
  readonly regionId: string;
  readonly categoryNote: string | null;
  readonly now: Date;
}

/** Başvurunun inceleme sonucu (state-machines §12). */
export type SellerApplicationReview =
  { readonly to: 'approved'; readonly businessId: string } | { readonly to: 'rejected' };

function pgErrorOf(error: unknown, code: string, constraint: string): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth++) {
    if ('code' in current && current.code === code && 'constraint' in current) {
      return current.constraint === constraint;
    }
    current = 'cause' in current ? current.cause : undefined;
  }
  return false;
}

/** Aynı VÖEN ile açık başvuru (kısmi benzersiz indeks, US-008 AC3). */
export function isPendingVoenViolation(error: unknown): boolean {
  return pgErrorOf(error, '23505', 'seller_applications_voen_pending_uq');
}

/** Bilinmeyen bölge (FK). */
export function isUnknownRegionViolation(error: unknown): boolean {
  return pgErrorOf(error, '23503', 'seller_applications_region_id_regions_id_fk');
}

/**
 * Toptancı başvuruları (F2.2). Kimliksiz ekleme `seller_application_submit` SECURITY DEFINER
 * fonksiyonuyla (bağlamsız `withSystemTx`); okuma ve inceleme yalnızca platform işleminde (`tx`,
 * platform-admin modülü açar). Durum yalnızca `SellerApplicationStateMachine` ile değişir.
 */
@Injectable()
export class SellerApplicationsRepository {
  async submit(input: NewSellerApplication): Promise<void> {
    await withSystemTx(async (tx) => {
      await tx.execute(sql`select seller_application_submit(
        ${input.id}::uuid, ${input.legalName}, ${input.voen}, ${input.contactName},
        ${input.phoneE164}, ${input.regionId}::uuid, ${input.categoryNote},
        ${input.now.toISOString()}::timestamptz)`);
    });
  }

  /** Yeniden eskiye; `cursor` = önceki sayfanın son kimliği (UUIDv7 zamana göre sıralı). */
  async listTx(
    tx: Tx,
    status: SellerApplicationStatus,
    cursor: string | undefined,
    limit: number,
  ): Promise<SellerApplicationRow[]> {
    return await tx
      .select()
      .from(sellerApplications)
      .where(
        and(
          eq(sellerApplications.status, status),
          cursor === undefined ? undefined : lt(sellerApplications.id, cursor),
        ),
      )
      .orderBy(desc(sellerApplications.id))
      .limit(limit);
  }

  /** Başvuruyu kilitleyerek okur (eşzamanlı onay/ret tek kez geçer). */
  async lockTx(tx: Tx, id: string): Promise<SellerApplicationRow | undefined> {
    const rows = await tx
      .select()
      .from(sellerApplications)
      .where(eq(sellerApplications.id, id))
      .for('update');
    return rows[0];
  }

  /** `pending` → `approved` / `rejected`; geçersiz geçiş `409 INVALID_STATE_TRANSITION`. */
  async reviewTx(
    tx: Tx,
    application: SellerApplicationRow,
    review: SellerApplicationReview,
    reviewedBy: string,
    now: Date,
  ): Promise<SellerApplicationRow> {
    SellerApplicationStateMachine.assertTransition(application.status, review.to);
    const rows = await tx
      .update(sellerApplications)
      .set({
        status: review.to,
        reviewedBy,
        businessId: review.to === 'approved' ? review.businessId : null,
        updatedAt: now,
      })
      .where(
        and(
          eq(sellerApplications.id, application.id),
          eq(sellerApplications.status, application.status),
        ),
      )
      .returning();
    const updated = rows[0];
    if (updated === undefined) throw new Error('seller_applications: kilitli satır güncellenemedi');
    return updated;
  }
}
