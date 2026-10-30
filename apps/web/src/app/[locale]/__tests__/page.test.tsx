import { describe, expect, it } from 'vitest';
import HomePage from '../page';

describe('Web ana sayfası', () => {
  // F1.13b: sayfa artık boş değil; içerik oturuma göre yönlendiren istemci bileşeni.
  it('F0.3-AC5: web ana sayfası render ediliyor', () => {
    const element = HomePage();
    expect(element.type).toBe('main');
  });
});
