// F1.10-AC3 (R2 tarafı, ADR-0023 madde 5): imzalı URL'ler ağsız üretilir; süre, imza zamanı
// (FixedClock) ve bucket seçimi URL'de görünür. Gerçek R2 davranışı staging'de elle doğrulanır.
import { randomBytes } from 'node:crypto';
import { type S3Client, S3ServiceException } from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';
import { FixedClock } from '../../../core/clock';
import { S3FileStorage } from '../s3-file-storage';

const NOW = new Date('2026-10-30T10:00:00.000Z');

function storage() {
  return new S3FileStorage(
    {
      accountId: 'acc123',
      accessKeyId: 'test-access-id',
      // Her çalıştırmada rastgele (depoda anahtar gibi görünen değer yok).
      secretAccessKey: randomBytes(24).toString('hex'),
      buckets: { public: 'test-public', private: 'test-private' },
    },
    new FixedClock(NOW),
  );
}

const BUSINESS = '0190f1a0-0000-7000-8000-000000000001';

describe('S3FileStorage imzalı URL', () => {
  it("F1.10-AC3: private okuma URL'si private bucket'ta, 300 sn süreli ve Clock anında imzalı", async () => {
    const url = new URL(
      await storage().createDownloadUrl({
        key: `${BUSINESS}/delivery_photo/0190f1a0-0000-7000-8000-0000000000aa.jpg`,
        ttlSeconds: 300,
      }),
    );

    expect(url.host).toBe('test-private.acc123.r2.cloudflarestorage.com');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(url.searchParams.get('X-Amz-Date')).toBe('20261030T100000Z');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
  });

  it("F1.10-AC2: yükleme URL'si tek yazımlık — If-None-Match: * imzada (PR #28 M1)", async () => {
    const result = await storage().createUploadUrl({
      bucket: 'private',
      key: `${BUSINESS}/import/0190f1a0-0000-7000-8000-0000000000dd.xlsx`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      maxBytes: 10,
      ttlSeconds: 600,
    });
    const signed = new URL(result.url).searchParams.get('X-Amz-SignedHeaders') ?? '';
    expect(signed.split(';')).toContain('if-none-match');
    expect(result.headers['If-None-Match']).toBe('*');
  });

  it("yükleme URL'si: public bucket, 600 sn, içerik türü ve boyut imzada", async () => {
    const result = await storage().createUploadUrl({
      bucket: 'public',
      key: `${BUSINESS}/product_image/0190f1a0-0000-7000-8000-0000000000bb.png`,
      contentType: 'image/png',
      maxBytes: 1234,
      ttlSeconds: 600,
    });
    const url = new URL(result.url);

    expect(url.host).toBe('test-public.acc123.r2.cloudflarestorage.com');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('600');
    const signed = url.searchParams.get('X-Amz-SignedHeaders') ?? '';
    expect(signed.split(';')).toEqual(
      expect.arrayContaining(['content-length', 'content-type', 'if-none-match']),
    );
    expect(result.headers).toEqual({
      'Content-Type': 'image/png',
      'Content-Length': '1234',
      'If-None-Match': '*',
    });
  });

  it('anahtar ve bucket uyuşmazsa URL üretilmez', async () => {
    await expect(
      storage().createUploadUrl({
        bucket: 'public',
        key: `${BUSINESS}/delivery_photo/0190f1a0-0000-7000-8000-0000000000cc.jpg`,
        contentType: 'image/jpeg',
        maxBytes: 10,
        ttlSeconds: 600,
      }),
    ).rejects.toThrow();
  });

  it('F1.10b: putIfAbsent — nesne varsa (412) false, yoksa true; If-None-Match: * gönderilir', async () => {
    const sent: unknown[] = [];
    let exists = false;
    const client = {
      send: (command: { input: unknown }) => {
        sent.push(command.input);
        if (exists) {
          return Promise.reject(
            new S3ServiceException({
              name: 'PreconditionFailed',
              $fault: 'client',
              $metadata: { httpStatusCode: 412 },
              message: 'At least one of the pre-conditions you specified did not hold',
            }),
          );
        }
        exists = true;
        return Promise.resolve({});
      },
    } as unknown as S3Client;
    const s3 = new S3FileStorage(
      {
        accountId: 'acc123',
        accessKeyId: 'test-access-id',
        secretAccessKey: randomBytes(24).toString('hex'),
        buckets: { public: 'test-public', private: 'test-private' },
        client,
      },
      new FixedClock(NOW),
    );
    const key = `${BUSINESS}/logo/0190f1a0-0000-7000-8000-0000000000ee.png`;

    expect(await s3.putIfAbsent(key, Buffer.from('a'), 'image/png')).toBe(true);
    expect(await s3.putIfAbsent(key, Buffer.from('b'), 'image/png')).toBe(false);
    expect(sent[0]).toMatchObject({ Bucket: 'test-public', Key: key, IfNoneMatch: '*' });
  });
});
