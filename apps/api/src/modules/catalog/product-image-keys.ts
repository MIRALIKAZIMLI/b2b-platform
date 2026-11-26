// Ürün görseli boyutlarının depo anahtarları (F3.4a, kart K2). Orijinal anahtar
// `<işletme>/product_image/<fileId>.<ext>`; boyut anahtarı aynı klasörde
// `<fileId>-<px>.webp` (public bucket, `fileBucketOfKey` ile aynı biçim).
import { PRODUCT_IMAGE_SIZES, type ProductImageSize } from '@b2b/shared';

const ORIGINAL_KEY = /^([^/]+)\/product_image\/([^/.]+)\.(jpg|png|webp)$/;

export function renditionKey(originalKey: string, size: ProductImageSize): string {
  const match = ORIGINAL_KEY.exec(originalKey);
  if (match === null) throw new Error('Geçersiz ürün görseli anahtarı');
  const [, owner, fileId] = match;
  return `${owner ?? ''}/product_image/${fileId ?? ''}-${String(PRODUCT_IMAGE_SIZES[size])}.webp`;
}

export const PRODUCT_IMAGE_SIZE_NAMES = Object.keys(PRODUCT_IMAGE_SIZES) as ProductImageSize[];
