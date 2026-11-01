// F2.4: sipariş gönderiminde VÖEN ön koşulu (US-006 AC4, AC5). Sepet ucu F4'te bu fonksiyonu çağırır.
import { describe, expect, it } from 'vitest';
import { DomainError } from '../../../core/errors/domain-error';
import { requireVoen } from '../voen-guard';

function codeOf(fn: () => void): string | undefined {
  try {
    fn();
    return undefined;
  } catch (error) {
    return error instanceof DomainError ? error.code : 'unexpected';
  }
}

describe('requireVoen', () => {
  it('US-006-AC4: VÖEN yoksa gönderim VOEN_REQUIRED ile engellenir', () => {
    expect(
      codeOf(() => {
        requireVoen({ voen: null });
      }),
    ).toBe('VOEN_REQUIRED');
    expect(
      codeOf(() => {
        requireVoen({ voen: '' });
      }),
    ).toBe('VOEN_REQUIRED');
  });

  it('US-006-AC5: VÖEN var ama doğrulanmamış → gönderim engellenmez', () => {
    expect(
      codeOf(() => {
        requireVoen({ voen: '1234567891', verifiedAt: null });
      }),
    ).toBeUndefined();
    expect(
      codeOf(() => {
        requireVoen({ voen: '1234567892', verifiedAt: new Date(0) });
      }),
    ).toBeUndefined();
  });
});
