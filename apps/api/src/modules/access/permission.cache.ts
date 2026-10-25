// İzin önbelleği (F1.8b, c4 §4): üyelik başına `access:perm:<membershipId>` → `{ roleId, permissions }`,
// ömür `access.permission_cache_seconds`. Değer, o istekte veritabanından okunan güncel `role_id` ile
// eşleşmezse yok sayılır: rol değişikliği bir sonraki istekte, olay işlenmesini beklemeden geçerli
// olur (F1.8-AC5). Rol değişikliğinde anahtar ayrıca silinir (servis + worker tüketicisi).
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

  /** Önbellekteki izinler; yoksa, bozuksa veya rol değiştiyse undefined. */
  async get(membershipId: string, roleId: string): Promise<PermissionEntries | undefined> {
    let raw: string | null;
    try {
      raw = await this.redis.get(permissionCacheKey(membershipId));
    } catch (error: unknown) {
      this.warn('get', error);
      return undefined;
    }
    if (raw === null) return undefined;
    const stored = parse(raw);
    if (stored?.roleId !== roleId) return undefined;
    const entries: [PermissionCode, PermissionScope][] = [];
    for (const item of stored.permissions) {
      const [code, scope] = item;
      if (typeof code !== 'string' || typeof scope !== 'string') return undefined;
      if (!isPermissionCode(code) || !isPermissionScope(scope)) return undefined;
      entries.push([code, scope]);
    }
    return entries;
  }

  async set(membershipId: string, roleId: string, permissions: PermissionEntries): Promise<void> {
    try {
      const seconds = await this.settings.get('access.permission_cache_seconds');
      const value: Stored = { roleId, permissions: permissions.map(([c, s]) => [c, s]) };
      await this.redis.set(permissionCacheKey(membershipId), JSON.stringify(value), 'EX', seconds);
    } catch (error: unknown) {
      this.warn('set', error);
    }
  }

  async invalidate(membershipId: string): Promise<void> {
    try {
      await this.redis.del(permissionCacheKey(membershipId));
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
