// Bağlantısız hesap sayacının girişte sıfırlanması (F2.17, US-027 AC3; state-machines §9).
// Kimlik modülü oturum açılınca veya yenilenince `LoginActivityHook.onActivity`'yi çağırır. Kullanıcı
// bağlamlı tek işlemde `buyer_dormant_touch` kullanıcının aktif üyesi olduğu perakendecilerde aşamayı
// `none`'a, sayacı şimdiye çeker; `dormant` işletme `active` olur (audit + dizin olayı). Fonksiyon
// yalnız gerekince yazar (`dormant.touch_min_interval_minutes`); çoğu yenileme tek okuma sorgusudur.
import { Global, Inject, Injectable, Module } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { type AuditRecorder, AuditModule, AuditService } from '../../core/audit';
import { type Tx, withUserTx } from '../../core/db';
import { OutboxModule, OutboxWriter } from '../../core/outbox';
import { LoginActivityHook } from '../identity';
import { SettingsModule, SettingsService } from '../settings';
import { BusinessStateMachine } from './business.state-machine';

interface TouchRow extends Record<string, unknown> {
  readonly business_id: string;
  readonly reactivated: boolean;
}

@Injectable()
export class DormantActivityService extends LoginActivityHook {
  constructor(
    @Inject(SettingsService) private readonly settings: Pick<SettingsService, 'get'>,
    @Inject(AuditService) private readonly audit: AuditRecorder,
    @Inject(OutboxWriter) private readonly outbox: Pick<OutboxWriter, 'write'>,
  ) {
    super();
  }

  async onActivity(userId: string, now: Date): Promise<void> {
    // Geçiş tablosu kaynağı durum makinesi; `buyer_dormant_touch` yalnız `dormant → active` yazar.
    BusinessStateMachine.assertTransition('dormant', 'active');
    const minutes = await this.settings.get('dormant.touch_min_interval_minutes');
    await withUserTx({ userId }, async (tx) => {
      const result = await tx.execute<TouchRow>(
        sql`select business_id, reactivated
              from buyer_dormant_touch(${now.toISOString()}::timestamptz, ${minutes}::integer)`,
      );
      for (const row of result.rows) {
        if (row.reactivated) await this.reactivatedTx(tx, userId, row.business_id);
      }
    });
  }

  private async reactivatedTx(tx: Tx, userId: string, businessId: string): Promise<void> {
    await this.audit.record(tx, {
      actor: { type: 'user', userId },
      businessId,
      action: 'business.reactivated',
      targetType: 'business',
      targetId: businessId,
      before: { status: 'dormant' },
      after: { status: 'active', dormantStage: 'none' },
    });
    // Dizine geri döner (D fonksiyonları yalnız `active` işletmeyi okur).
    await this.outbox.write(tx, {
      type: 'buyer.profile_changed',
      aggregateType: 'business',
      aggregateId: businessId,
      businessIds: [businessId],
      payload: { businessId },
    });
  }
}

/** `LoginActivityHook` uygulaması. Global: identity businesses'ı içe aktarmadan belirteci çözer. */
@Global()
@Module({
  imports: [SettingsModule, AuditModule, OutboxModule],
  providers: [
    DormantActivityService,
    { provide: LoginActivityHook, useExisting: DormantActivityService },
  ],
  exports: [LoginActivityHook],
})
export class LoginActivityHookModule {}
