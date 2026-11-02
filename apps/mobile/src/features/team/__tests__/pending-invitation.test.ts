import { afterEach, describe, expect, it } from 'vitest';
import {
  capturePendingInvitation,
  clearPendingInvitation,
  pendingInvitation,
} from '../pending-invitation';

describe('F2.7b mobil davet kabulü', () => {
  afterEach(() => {
    clearPendingInvitation();
  });

  it('F2.7b deep link token bellekte bekler; girişten sonra okunur ve silinir', () => {
    expect(pendingInvitation()).toBeUndefined();
    expect(capturePendingInvitation('tok_1')).toBe(true);
    expect(pendingInvitation()).toBe('tok_1');
    clearPendingInvitation();
    expect(pendingInvitation()).toBeUndefined();
  });

  it('F2.7b geçersiz parametre (boş, dizi, uzun) yok sayılır, bekleyen davet korunur', () => {
    capturePendingInvitation('tok_1');
    expect(capturePendingInvitation('')).toBe(false);
    expect(capturePendingInvitation(['a', 'b'])).toBe(false);
    expect(capturePendingInvitation('x'.repeat(257))).toBe(false);
    expect(pendingInvitation()).toBe('tok_1');
  });
});
