// VÖEN (vergi kimlik numarası) biçim doğrulaması (F1.7-AC2, data-model §4.4 `businesses.voen`).
// Kural: 10 rakam, son hane 1 veya 2. Desen openapi.yaml `Voen` şemasıyla aynıdır.
// Kontrol hanesi algoritması yok (F0.1 açık soru); yalnızca biçim denetlenir. Kırpma yapılmaz.
import { z } from 'zod';

export const VOEN_PATTERN = /^[0-9]{9}[12]$/;

export function isValidVoen(value: string): boolean {
  return VOEN_PATTERN.test(value);
}

export const voenSchema = z.string().regex(VOEN_PATTERN, { message: 'VOEN_INVALID' });
