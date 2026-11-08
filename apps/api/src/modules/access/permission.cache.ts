// İzin önbelleği (F1.8b, c4 §4): üyelik başına `access:perm:<membershipId>` → `{ roleId, permissions }`,
// ömür `access.permission_cache_seconds`. Değer, o istekte veritabanından okunan güncel `role_id` ve
// `roles.permissions_version` ile eşleşmezse yok sayılır: rol değişikliği (F1.8-AC5) ve rolün izin
// değişikliği (F2.8, R22) bir sonraki istekte, olay işlenmesini beklemeden geçerli olur. Anahtar
// ayrıca silinir (servis commit sonrası + worker tüketicisi).
// Redis yoksa önbellek atlanır, veritabanından okunur, uyarı loglanır (F1.4a kalıbı).
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  isPermissionCode,
  isPermissionScope,
  type PermissionCode,
  type PermissionScope,
} from '@b2b/shared';
import { REDIS_CLIENT } from '../../infrastructure/redis';
import { SettingsService } from '../settings';

/** Kullanılan Redis komutları (ioredis `Redis` uyar; testte bellek karşılığı). */
export interface PermissionRedis {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<'OK'>;
  del(...keys: string[]): Promise<number>;
}

export type PermissionEntries = readonly (readonly [PermissionCode, PermissionScope])[];

export function permissionCacheKey(membershipId: string): string {
  return `access:perm:${membershipId}`;
}

interface Stored {
  readonly roleId: string;
  readonly version?: unknown;
  readonly permissions: [string, string][];
}

function parse(raw: string): Stored | undefined {
  try {
    const value: unknown = JSON.parse(raw);
    if (
      typeof value === 'object' &&
      value !== null &&
      'roleId' in value &&
      typeof value.roleId === 'string' &&
      'permissions' in value &&
      Array.isArray(value.permissions)
    ) {
      return value as Stored;
    }
  } catch (error: unknown) {
    // Bozuk kayıt: önbellek yok sayılır (veritabanından okunur).
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
  return undefined;
}

@Injectable()
export class PermissionCache {
  private readonly logger = new Logger(PermissionCache.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: PermissionRedis,
    @Inject(SettingsService) private readonly settings: Pick<SettingsService, 'get'>,
  ) {}

  /** Önbellekteki izinler; yoksa, bozuksa, rol veya rolün izin sürümü değiştiyse undefined. */
  async get(
    membershipId: string,
    roleId: string,
    version = 1,
  ): Promise<PermissionEntries | undefined> {
    let raw: string | null;
    try {
      raw = await this.redis.get(permissionCacheKey(membershipId));
    } catch (error: unknown) {
      this.warn('get', error);
      return undefined;
    }
    if (raw === null) return undefined;
    const stored = parse(raw);
    if (stored?.roleId !== roleId || stored.version !== version) return undefined;
    const entries: [PermissionCode, PermissionScope][] = [];
    for (const item of stored.permissions) {
      const [code, scope] = item;
      if (typeof code !== 'string' || typeof scope !== 'string') return undefined;
      if (!isPermissionCode(code) || !isPermissionScope(scope)) return undefined;
      entries.push([code, scope]);
    }
    return entries;
  }

  async set(
    membershipId: string,
    roleId: string,
    permissions: PermissionEntries,
    version = 1,
  ): Promise<void> {
    try {
      const seconds = await this.settings.get('access.permission_cache_seconds');
      const value: Stored = {
        roleId,
        version,
        permissions: permissions.map(([c, s]) => [c, s]),
      };
      await this.redis.set(permissionCacheKey(membershipId), JSON.stringify(value), 'EX', seconds);
    } catch (error: unknown) {
      this.warn('set', error);
    }
  }

  async invalidate(membershipId: string): Promise<void> {
    await this.invalidateMany([membershipId]);
  }

  /** F2.8: rolün izni değişince rolün tüm üyeliklerinin anahtarı tek komutla silinir. */
  async invalidateMany(membershipIds: readonly string[]): Promise<void> {
    if (membershipIds.length === 0) return;
    try {
      await this.redis.del(...membershipIds.map(permissionCacheKey));
    } catch (error: unknown) {
      this.warn('invalidate', error);
    }
  }

  private warn(operation: string, error: unknown): void {
    // Hata nesnesi ham loglanmaz (review-guide T8); yalnızca türü.
    const kind = error instanceof Error ? error.name : 'unknown';
    this.logger.warn({ event: 'access.permission_cache_unavailable', operation, kind });
  }
}
