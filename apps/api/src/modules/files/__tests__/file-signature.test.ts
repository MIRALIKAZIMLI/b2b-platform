// NFR-49: içerik türü dosya imzasıyla (ilk baytlar) doğrulanır.
import { describe, expect, it } from 'vitest';
import { detectContentType, XLSX_CONTENT_TYPE } from '../file-signature';

const bytes = (...values: number[]) => Buffer.from(values);

describe('detectContentType (ilk 16 bayt)', () => {
  it('PNG, JPEG, WebP ve XLSX (ZIP) imzalarını tanır', () => {
    expect(detectContentType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe(
      'image/png',
    );
    expect(detectContentType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(detectContentType(Buffer.from('RIFF\x10\x00\x00\x00WEBPVP8 ', 'latin1'))).toBe(
      'image/webp',
    );
    expect(detectContentType(bytes(0x50, 0x4b, 0x03, 0x04, 0x14))).toBe(XLSX_CONTENT_TYPE);
  });

  it('F1.10-AC2: EXE (MZ), boş ve eksik imza tanınmaz', () => {
    expect(detectContentType(Buffer.from('MZ\x90\x00\x03\x00\x00\x00', 'latin1'))).toBeNull();
    expect(detectContentType(Buffer.alloc(0))).toBeNull();
    expect(detectContentType(bytes(0x89, 0x50, 0x4e))).toBeNull();
    // RIFF ama WEBP değil (ör. WAV)
    expect(detectContentType(Buffer.from('RIFF\x10\x00\x00\x00WAVEfmt ', 'latin1'))).toBeNull();
  });
});
