import { Injectable } from '@nestjs/common';
import type { SettingKey } from '@b2b/shared';
import { sql } from 'drizzle-orm';
import { type Tx, withPlatformTx, withSystemTx, withTenantTx } from '../../core/db';
import type { SettingLayers, SettingsRepositoryPort, SettingTarget } from './settings.ports';

interface LayerRow extends Record<string, unknown> {
  scope: string;
  value: unknown;
}

/**
 * `settings` (S) erişimi yalnızca SECURITY DEFINER fonksiyonlarla (F1.4a K1, K2):
 * - okuma: işletme varsa withTenantTx (kullanıcısız), yoksa withSystemTx; withPlatformTx değil.
 *   İşletme verilirse fonksiyon güncel aboneliğin plan satırını da döndürür (F1.4b).
 * - yazma: withPlatformTx; `updated_by` fonksiyonda `app.user_id`'den yazılır.
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

  async write(
    target: SettingTarget,
    key: SettingKey,
    value: unknown,
    userId: string,
  ): Promise<void> {
    const scopeId =
      target.scope === 'business'
        ? target.businessId
        : target.scope === 'plan'
          ? target.planId
          : null;
    const json = JSON.stringify(value);
    await withPlatformTx({ userId }, (tx) =>
      tx.execute(
        sql`select settings_put(${target.scope}, ${scopeId}::uuid, ${key}, ${json}::jsonb)`,
      ),
    );
  }
}
