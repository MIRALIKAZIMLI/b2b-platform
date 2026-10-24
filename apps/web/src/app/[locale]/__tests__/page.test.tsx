import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import HomePage from '../page';

describe('Web ana sayfası', () => {
  it('F0.3-AC5: web boş sayfa render ediliyor', () => {
    expect(renderToStaticMarkup(<HomePage />)).toBe('<main></main>');
  });
});
