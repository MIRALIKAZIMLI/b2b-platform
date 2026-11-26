// F3.4b birim: görsel sırası ve hata mesajı seçimi (F3.4a K6; F1.10 FILE_INVALID, 422 fileId).
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../admin-sellers/api';
import type { ProductImage } from '../api';
import { imageErrorKey, movedOrder } from '../images-card';

const image = (id: string): ProductImage => ({ id, sortOrder: 0, status: 'ready', urls: null });
const images = ['a', 'b', 'c', 'd'].map(image);

describe('F3.4b görsel kartı (birim)', () => {
  it('F3.4b-ORD kapak yapma ve oklar tam sırayı üretir', () => {
    expect(movedOrder(images, 2, 0)).toEqual(['c', 'a', 'b', 'd']);
    expect(movedOrder(images, 1, 2)).toEqual(['a', 'c', 'b', 'd']);
    expect(movedOrder(images, 3, 2)).toEqual(['a', 'b', 'd', 'c']);
    expect(movedOrder(images, 0, -1)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('F3.4b-ERR API hatası doğru mesaja düşer', () => {
    const fileInvalid = (reason: string) =>
      new ApiError({ code: 'FILE_INVALID', details: { reason } }, 422);
    expect(imageErrorKey(fileInvalid('size'))).toBe('size');
    expect(imageErrorKey(fileInvalid('signature'))).toBe('type');
    expect(imageErrorKey(fileInvalid('content_type'))).toBe('type');
    expect(imageErrorKey(fileInvalid('not_uploaded'))).toBe('failed');
    expect(
      imageErrorKey(
        new ApiError({ code: 'VALIDATION_FAILED', details: { fileId: ['limit'] } }, 422),
      ),
    ).toBe('limit');
    expect(imageErrorKey(new ApiError(undefined, 500))).toBe('failed');
    expect(imageErrorKey(new Error('x'))).toBe('failed');
  });
});
