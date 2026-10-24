import { describe, expect, it } from 'vitest';
import { readPort } from '../port';

describe('readPort', () => {
  it('PORT yoksa varsayılan 3000 döner', () => {
    expect(readPort({})).toBe(3000);
  });

  it('geçerli PORT değerini sayı olarak döner', () => {
    expect(readPort({ PORT: '4100' })).toBe(4100);
  });

  it.each(['abc', '0', '70000', '3000.5'])('geçersiz PORT (%s) ile hata fırlatır', (value) => {
    expect(() => readPort({ PORT: value })).toThrow(/PORT geçersiz/);
  });
});
