import { describe, expect, it } from 'vitest';
import { canonicalJson, requestHash } from '../request-hash';

const base = {
  method: 'POST',
  url: '/api/v1/cart/approve?branch=1',
  businessId: '0193a1b2-0000-7000-8000-000000000001',
  body: { b: 1, a: [{ y: 2, x: 1 }] },
};

describe('request-hash', () => {
  it('K4: kanonik JSON anahtar sırasından bağımsızdır', () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: null } })).toBe(
      canonicalJson({ a: { c: null, d: [1, { y: 2, z: 1 }] }, b: 1 }),
    );
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it('K4: dizi sırası korunur, undefined alanlar atlanır', () => {
    expect(canonicalJson([2, 1])).not.toBe(canonicalJson([1, 2]));
    expect(canonicalJson({ a: 1, b: undefined })).toBe(canonicalJson({ a: 1 }));
    expect(canonicalJson(undefined)).toBe('null');
  });

  it('K4: aynı istek → aynı SHA-256 özeti (64 onaltılık karakter)', () => {
    const hash = requestHash(base);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(requestHash({ ...base, body: { a: [{ x: 1, y: 2 }], b: 1 } })).toBe(hash);
  });

  it('D1: yöntem, yol, sorgu dizesi, X-Business-Id veya gövde değişirse özet değişir', () => {
    const hash = requestHash(base);
    expect(requestHash({ ...base, method: 'PUT' })).not.toBe(hash);
    expect(requestHash({ ...base, url: '/api/v1/cart/other?branch=1' })).not.toBe(hash);
    expect(requestHash({ ...base, url: '/api/v1/cart/approve?branch=2' })).not.toBe(hash);
    expect(requestHash({ ...base, businessId: '0193a1b2-0000-7000-8000-000000000002' })).not.toBe(
      hash,
    );
    expect(requestHash({ ...base, businessId: undefined })).not.toBe(hash);
    expect(requestHash({ ...base, body: { b: 2, a: [{ y: 2, x: 1 }] } })).not.toBe(hash);
  });

  it('D1: alanlar birbirine kaydırılarak aynı özet üretilemez', () => {
    expect(requestHash({ ...base, url: '/a', businessId: 'b/c' })).not.toBe(
      requestHash({ ...base, url: '/a/b', businessId: 'c' }),
    );
  });
});
