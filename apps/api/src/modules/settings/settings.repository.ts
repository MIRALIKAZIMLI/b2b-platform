import { Injectable } from '@nestjs/common';
import type { SettingKey } from '@b2b/shared';
import { sql } from 'drizzle-orm';
import { type Tx, withPlatformTx, withSystemTx, withTenantTx } from '../../core/db';
import type {
  SettingLayers,
  SettingScopeRow,
  SettingsRepositoryPort,
  SettingTarget,
  SettingWriteHook,
} from './settings.ports';

interface LayerRow extends Record<string, unknown> {
  scope: string;
  value: unknown;
}

interface ScopeRow extends Record<string, unknown> {
  scope: 'platform' | 'plan' | 'business';
  key: string;
  value: unknown;
  updated_at: Date | string;
}

interface PutRow extends Record<string, unknown> {
  /** settings_put dönüşü: aynı kapsamdaki önceki değer (yoksa null). */
  previous: unknown;
}

/**
 * `settings` (S) erişimi yalnızca SECURITY DEFINER fonksiyonlarla (F1.4a K1, K2):
 * - okuma: işletme varsa withTenantTx (kullanıcısız), yoksa withSystemTx; withPlatformTx değil.
 *   İşletme verilirse fonksiyon güncel aboneliğin plan satırını da döndürür (F1.4b).
 * - yazma: withPlatformTx; `updated_by` fonksiyonda `app.user_id`'den yazılır. Fonksiyon önceki
 *   değeri döner; `afterWrite` (audit) aynı işlemde çağrılır (F1.9).
 */
@Injectable()
export class SettingsRepository implements SettingsRepositoryPort {
  async read(key: SettingKey, businessId?: string): Promise<SettingLayers> {
    const query = (tx: Tx) =>
      tx.execute<LayerRow>(
        sql`select scope, value from settings_get(${key}, ${businessId ?? null}::uuid)`,
      );
    const result =
      businessId === undefined
        ? await withSystemTx(query)
        : await withTenantTx({ businessId, userId: null }, query);

    const layers: { platform?: unknown; plan?: unknown; business?: unknown } = {};
    for (const row of result.rows) {
      if (row.scope === 'platform') layers.platform = row.value;
      if (row.scope === 'plan') layers.plan = row.value;
      if (row.scope === 'business') layers.business = row.value;
    }
    return layers;
  }

  /**
   * `settings_admin_list` (F2.19): yalnız platform bağlamında çalışır (aksi 42501); çağıranın
   * `withPlatformTx` işleminde.
   */
  async listScopeTx(tx: Tx, target: SettingTarget): Promise<SettingScopeRow[]> {
    const result = await tx.execute<ScopeRow>(
      sql`select scope, key, value, updated_at from settings_admin_list(${target.scope}, ${scopeIdOf(target)}::uuid)`,
    );
    return result.rows.map((row) => ({
      scope: row.scope,
      key: row.key,
      value: row.value,
      updatedAt: new Date(row.updated_at),
    }));
  }

  async write(
    target: SettingTarget,
    key: SettingKey,
    value: unknown,
    userId: string,
    afterWrite: SettingWriteHook,
  ): Promise<void> {
    const scopeId = scopeIdOf(target);
    const json = JSON.stringify(value);
    await withPlatformTx({ userId }, async (tx) => {
      const result = await tx.execute<PutRow>(
        sql`select settings_put(${target.scope}, ${scopeId}::uuid, ${key}, ${json}::jsonb) as previous`,
      );
      await afterWrite(tx, result.rows[0]?.previous ?? null);
    });
  }
}

function scopeIdOf(target: SettingTarget): string | null {
  if (target.scope === 'business') return target.businessId;
  if (target.scope === 'plan') return target.planId;
  return null;
}
