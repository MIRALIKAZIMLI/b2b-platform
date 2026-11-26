// F3.4a birim: görsel küçültme (K2, K5, R34) ve boyut anahtarları. Veritabanı yok.
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { ImageRejectedError, resizeProductImage } from '../jobs/resize-image.job';
import { renditionKey } from '../product-image-keys';

async function image(width: number, height: number, format: 'png' | 'jpeg' | 'webp' | 'gif') {
  const base = sharp({ create: { width, height, channels: 3, background: '#4f46e5' } });
  return await base.toFormat(format).toBuffer();
}

async function size(buffer: Buffer) {
  const meta = await sharp(buffer).metadata();
  return { format: meta.format, width: meta.width, height: meta.height };
}

describe('F3.4a görsel küçültme (birim)', () => {
  it('F3.4a-AC3 uzun kenar 200/800/1600 px WebP; oran korunur', async () => {
    const out = await resizeProductImage(await image(2400, 1200, 'jpeg'), 40_000_000);
    expect(await size(out.thumb)).toEqual({ format: 'webp', width: 200, height: 100 });
    expect(await size(out.medium)).toEqual({ format: 'webp', width: 800, height: 400 });
    expect(await size(out.large)).toEqual({ format: 'webp', width: 1600, height: 800 });
  });

  it('F3.4a-AC3 küçük görsel büyütülmez; dikey görselde uzun kenar yükseklik', async () => {
    const out = await resizeProductImage(await image(300, 600, 'png'), 40_000_000);
    expect(await size(out.thumb)).toEqual({ format: 'webp', width: 100, height: 200 });
    expect(await size(out.medium)).toEqual({ format: 'webp', width: 300, height: 600 });
    expect(await size(out.large)).toEqual({ format: 'webp', width: 300, height: 600 });
  });

  it('F3.4a-AC3 EXIF üst verisi çıktıya yazılmaz', async () => {
    const withExif = await sharp(await image(400, 300, 'jpeg'))
      .withExif({ IFD0: { Copyright: 'gizli-konum' } })
      .jpeg()
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();
    const out = await resizeProductImage(withExif, 40_000_000);
    expect((await sharp(out.large).metadata()).exif).toBeUndefined();
  });

  it('F3.4a-R34 piksel sınırını aşan görsel reddedilir (decode)', async () => {
    const big = await image(1200, 1000, 'png');
    await expect(resizeProductImage(big, 1_000_000)).rejects.toEqual(
      new ImageRejectedError('decode'),
    );
  });

  it('F3.4a-R34 bozuk veri ve desteklenmeyen tür reddedilir', async () => {
    const png = await image(50, 50, 'png');
    const broken = Buffer.concat([png.subarray(0, 40), Buffer.alloc(200, 7)]);
    await expect(resizeProductImage(broken, 40_000_000)).rejects.toBeInstanceOf(ImageRejectedError);
    await expect(resizeProductImage(await image(50, 50, 'gif'), 40_000_000)).rejects.toEqual(
      new ImageRejectedError('format'),
    );
  });

  it('F3.4a-AC3 boyut anahtarı orijinalin klasöründe; biçim dışı anahtar hata', () => {
    expect(renditionKey('b1/product_image/f1.jpg', 'thumb')).toBe('b1/product_image/f1-200.webp');
    expect(renditionKey('b1/product_image/f1.png', 'large')).toBe('b1/product_image/f1-1600.webp');
    expect(() => renditionKey('b1/logo/f1.png', 'thumb')).toThrow();
    expect(() => renditionKey('b1/product_image/../x.png', 'thumb')).toThrow();
  });
});
