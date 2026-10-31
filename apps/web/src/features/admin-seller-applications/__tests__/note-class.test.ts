import { describe, expect, it } from 'vitest';
import { NOTE_CLASS } from '../note-class';

describe('başvuru notu kartı (B2)', () => {
  it('B2 boşluksuz uzun not satır kırar: overflow-wrap:anywhere sınıfı var', () => {
    expect(NOTE_CLASS).toContain('[overflow-wrap:anywhere]');
  });
});
