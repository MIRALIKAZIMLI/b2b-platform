// Yeniden indeksleme sırasında değişen perakendeciler (F2.11a, Müfettiş 15 M1).
// Rebuild yeni indeksi doldururken artımlı güncellemeler eski (canlı) indekse yazılır ve takasla
// kaybolur. Bu yüzden kilit tutulurken her `refresh` kimliğini önce "kirli" kümeye ekler; rebuild
// takastan hemen sonra kümeyi boşaltır ve bu kimlikleri yeni canlı indekste yeniden işler.
// Sıra önemli: kimlik, belge veritabanından okunmadan önce eklenir. Takastan önce yazılıp
// kaybolan her güncellemenin kimliği böylece boşaltmadan önce kümededir.
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { REDIS_CLIENT } from '../../infrastructure/redis';
import { DIRECTORY_REINDEX_DIRTY_KEY, DIRECTORY_REINDEX_LOCK_KEY } from './directory-events';

export interface RebuildTrackerRedis {
  eval(script: string, keys: number, ...args: string[]): Promise<unknown>;
}

/** Kilit varsa kimlikleri kümeye ekler; kümenin ömrü kilidin kalan ömrüdür. */
const MARK_SCRIPT = `
if redis.call('exists', KEYS[1]) == 1 then
  redis.call('sadd', KEYS[2], unpack(ARGV))
  local ttl = redis.call('pttl', KEYS[1])
  if ttl > 0 then redis.call('pexpire', KEYS[2], ttl) end
  return 1
end
return 0`;

/** Kümeyi tek adımda okur ve siler. */
const DRAIN_SCRIPT = `
local members = redis.call('smembers', KEYS[1])
redis.call('del', KEYS[1])
return members`;

@Injectable()
export class DirectoryRebuildTracker {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: RebuildTrackerRedis) {}

  async markIfRebuilding(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.redis.eval(
      MARK_SCRIPT,
      2,
      DIRECTORY_REINDEX_LOCK_KEY,
      DIRECTORY_REINDEX_DIRTY_KEY,
      ...ids,
    );
  }

  async drain(): Promise<string[]> {
    const members = await this.redis.eval(DRAIN_SCRIPT, 1, DIRECTORY_REINDEX_DIRTY_KEY);
    return z.array(z.uuid()).parse(members);
  }
}
