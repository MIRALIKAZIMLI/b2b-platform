// F1.10b (Müfettiş PR #29): doğrulanan baytlar ile kalıcı anahtara yazılan baytlar aynı okuma;
// kalıcı anahtar koşullu yazılır; geçici nesnenin silinememesi `ready` yanıtını bozmaz.
// Veritabanı ve depo sahte (birim testi).
import { describe, expect, it } from 'vitest';
import { FixedClock } from '../../../core/clock';
import type { TenantTxContext } from '../../../core/db';
import { UuidV7IdGenerator } from '../../../core/id-generator';
import { FileStorage, stagingKeyOf } from '../../../core/ports/file-storage';
import type { TenantContext } from '../../../core/tenant-context';
import type { FileRow, FilesRepository } from '../files.repository';
import { FilesService } from '../files.service';

const BUSINESS = '0190f1a0-0000-7000-8000-000000000001';
const FILE_ID = '0190f1a0-0000-7000-8000-0000000000aa';
const KEY = `${BUSINESS}/product_image/${FILE_ID}.png`;

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(24, 1),
]);
const EXE = Buffer.concat([Buffer.from('MZ\x90\x00', 'latin1'), Buffer.alloc(28, 0)]);

const tenant: TenantContext = {
  userId: '0190f1a0-0000-7000-8000-0000000000ff',
  businessId: BUSINESS,
  membershipId: '0190f1a0-0000-7000-8000-0000000000ee',
  capabilities: ['seller'],
  isBusinessAdmin: true,
  branchId: null,
  warehouseId: null,
  permissions: new Map([['catalog.manage', 'all']]),
};

/** Bellekte depo; `readRange` çağrıları sırayla verilen içerikleri döndürebilir. */
class FakeStorage extends FileStorage {
  readonly objects = new Map<string, Buffer>();
  readonly writes: { key: string; body: Buffer }[] = [];
  readRangeQueue: Buffer[] = [];
  failDelete = false;

  createUploadUrl() {
    return Promise.resolve({ url: 'http://unused', headers: {} });
  }
  createDownloadUrl() {
    return Promise.resolve('http://unused');
  }
  head(key: string) {
    const body = this.objects.get(key);
    return Promise.resolve(body ? { size: body.length, contentType: 'image/png' } : null);
  }
  readRange(key: string, bytes: number) {
    const next = this.readRangeQueue.shift() ?? this.objects.get(key) ?? Buffer.alloc(0);
    return Promise.resolve(next.subarray(0, bytes));
  }
  put(key: string, body: Buffer) {
    this.objects.set(key, body);
    this.writes.push({ key, body });
    return Promise.resolve();
  }
  putIfAbsent(key: string, body: Buffer) {
    if (this.objects.has(key)) return Promise.resolve(false);
    this.objects.set(key, body);
    this.writes.push({ key, body });
    return Promise.resolve(true);
  }
  delete(key: string) {
    if (this.failDelete) return Promise.reject(new Error('depo erişilemedi'));
    this.objects.delete(key);
    return Promise.resolve();
  }
}

class FakeRepository {
  row: FileRow = {
    id: FILE_ID,
    ownerBusinessId: BUSINESS,
    purpose: 'product_image',
    bucket: 'public',
    objectKey: KEY,
    contentType: 'image/png',
    sizeBytes: PNG.length,
    status: 'pending',
  };

  findById(_ctx: TenantTxContext, id: string) {
    return Promise.resolve(id === this.row.id ? this.row : undefined);
  }
  finish(_ctx: TenantTxContext, _id: string, result: { status: 'ready' | 'rejected' }) {
    if (this.row.status !== 'pending') return Promise.resolve(false);
    this.row = { ...this.row, status: result.status };
    return Promise.resolve(true);
  }
}

function setup() {
  const storage = new FakeStorage();
  const repository = new FakeRepository();
  const clock = new FixedClock(new Date('2026-10-30T10:00:00.000Z'));
  // Tüm `files.*` ayarları için 5 (MB / dakika); bu testlerde yeterli.
  const settings = { get: () => Promise.resolve(5) };
  const service = new FilesService(
    repository as unknown as FilesRepository,
    storage,
    settings,
    clock,
    new UuidV7IdGenerator(clock),
    'https://cdn.example.com',
  );
  return { storage, repository, service };
}

describe('FilesService.complete (F1.10b)', () => {
  it('H1: içerik doğrulamadan sonra değişse de kalıcı anahtara yalnızca doğrulanan baytlar yazılır', async () => {
    const { storage, service } = setup();
    storage.objects.set(stagingKeyOf(KEY), PNG);
    // İlk okuma PNG, sonraki okumalar (eski kodda kopya için ikinci okuma) EXE.
    storage.readRangeQueue = [PNG, EXE, EXE];

    const result = await service.complete(tenant, FILE_ID);

    expect(result.status).toBe('ready');
    expect(storage.writes).toHaveLength(1);
    expect(storage.writes[0]?.key).toBe(KEY);
    expect(storage.writes[0]?.body.subarray(0, 8)).toEqual(PNG.subarray(0, 8));
  });

  it('H1: kalıcı nesne zaten varsa üzerine yazılmaz (koşullu kopya)', async () => {
    const { storage, service } = setup();
    storage.objects.set(stagingKeyOf(KEY), PNG);
    storage.objects.set(KEY, PNG);

    const result = await service.complete(tenant, FILE_ID);

    expect(result.status).toBe('ready');
    expect(storage.writes).toHaveLength(0);
  });

  it('bildirilenden uzun içerik (bir bayt fazla okunur) reddedilir, kalıcıya yazılmaz', async () => {
    const { storage, repository, service } = setup();
    storage.objects.set(stagingKeyOf(KEY), PNG);
    storage.readRangeQueue = [Buffer.concat([PNG, Buffer.from([0])])];

    await expect(service.complete(tenant, FILE_ID)).rejects.toMatchObject({
      code: 'FILE_INVALID',
    });
    expect(storage.writes).toHaveLength(0);
    expect(repository.row.status).toBe('rejected');
  });

  it('M1: geçici nesne silinemezse yanıt yine ready', async () => {
    const { storage, repository, service } = setup();
    storage.objects.set(stagingKeyOf(KEY), PNG);
    storage.failDelete = true;

    const result = await service.complete(tenant, FILE_ID);

    expect(result).toMatchObject({ status: 'ready', url: `https://cdn.example.com/${KEY}` });
    expect(repository.row.status).toBe('ready');
  });
});
