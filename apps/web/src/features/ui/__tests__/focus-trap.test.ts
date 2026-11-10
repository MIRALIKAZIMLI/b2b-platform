import { describe, expect, it } from 'vitest';
import { wrapFocus } from '../focus-trap';

describe('F2.13b pencere odak tuzağı', () => {
  it('F2.13b-AC8 (#59 L2) Tab son öğeden ilke, Shift+Tab ilk öğeden sona döner', () => {
    expect(wrapFocus(2, 3, false)).toBe(0);
    expect(wrapFocus(0, 3, true)).toBe(2);
    // Ortadaki öğede tarayıcı sırası geçerli.
    expect(wrapFocus(1, 3, false)).toBeUndefined();
    expect(wrapFocus(1, 3, true)).toBeUndefined();
  });

  it('F2.13b-AC8 (#59 L2) odak pencere dışındaysa içeri alınır; boş pencerede dokunulmaz', () => {
    expect(wrapFocus(-1, 3, false)).toBe(0);
    expect(wrapFocus(-1, 3, true)).toBe(2);
    expect(wrapFocus(-1, 0, false)).toBeUndefined();
  });
});
