// Yerel disk deposu (ADR-0023): imzalı token süresi Clock'tan (F1.10-AC3), imza değişirse geçersiz.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FixedClock } from '../../../core/clock';
import { LocalFileStorage } from '../local-file-storage';

const KEY =
  '0190f1a0-0000-7000-8000-000000000001/dispute_photo/0190f1a0-0000-7000-8000-0000000000aa.jpg';

describe('LocalFileStorage', () => {
  let directory: string;
  let clock: FixedClock;
  let storage: LocalFileStorage;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'b2b-files-'));
    clock = new FixedClock(new Date('2026-10-30T10:00:00.000Z'));
    storage = new LocalFileStorage({ directory, baseUrl: 'http://localhost:3000' }, clock);
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  const tokenOf = (url: string) => new URL(url).searchParams.get('token') ?? '';

  it("F1.10-AC3: okuma token'ı süre içinde geçerli, süre dolunca geçersiz", async () => {
    const token = tokenOf(await storage.createDownloadUrl({ key: KEY, ttlSeconds: 300 }));

    expect(storage.verify(token)).toMatchObject({ op: 'get', key: KEY });
    clock.advance(299_000);
    expect(storage.verify(token)).not.toBeNull();
    clock.advance(1_000);
    expect(storage.verify(token)).toBeNull();
  });

  it('değiştirilmiş veya başka anahtarla imzalanmış token reddedilir', async () => {
    const token = tokenOf(await storage.createDownloadUrl({ key: KEY, ttlSeconds: 300 }));
    const [payload, signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ op: 'get', key: KEY.replace('dispute_photo', 'import'), exp: 9e15 }),
    ).toString('base64url');

    expect(storage.verify(`${forged}.${signature ?? ''}`)).toBeNull();
    expect(storage.verify(`${payload ?? ''}.AAAA`)).toBeNull();
    const other = new LocalFileStorage({ directory, baseUrl: 'http://localhost:3000' }, clock);
    expect(other.verify(token)).toBeNull();
  });

  it('put, head, readRange ve delete', async () => {
    await storage.put(KEY, Buffer.from('0123456789abcdefXYZ'), 'image/jpeg');

    expect(await storage.head(KEY)).toEqual({ size: 19, contentType: 'image/jpeg' });
    expect((await storage.readRange(KEY, 16)).toString()).toBe('0123456789abcdef');
    await storage.delete(KEY);
    expect(await storage.head(KEY)).toBeNull();
  });

  it('biçim dışı anahtar (yol gezintisi) kabul edilmez', async () => {
    await expect(storage.put('../x/import/a.xlsx', Buffer.from('x'), 'x')).rejects.toThrow();
    await expect(storage.put('a/import/../../etc.xlsx', Buffer.from('x'), 'x')).rejects.toThrow();
  });
});
