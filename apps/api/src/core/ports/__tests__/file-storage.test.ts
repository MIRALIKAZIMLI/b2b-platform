// F1.10b: geçici yükleme anahtarı her zaman private bucket'ta.
import { describe, expect, it } from 'vitest';
import { fileBucketOfKey, stagingKeyOf } from '../file-storage';

const OWNER = '0190f1a0-0000-7000-8000-000000000001';

describe('fileBucketOfKey / stagingKeyOf', () => {
  it("F1.10b: public amaçlı dosyanın geçici anahtarı private bucket'ta", () => {
    const key = `${OWNER}/product_image/0190f1a0-0000-7000-8000-0000000000aa.png`;

    expect(fileBucketOfKey(key)).toBe('public');
    expect(stagingKeyOf(key)).toBe(`${OWNER}/upload/0190f1a0-0000-7000-8000-0000000000aa.png`);
    expect(fileBucketOfKey(stagingKeyOf(key))).toBe('private');
  });

  it('biçim dışı anahtar reddedilir', () => {
    expect(() => fileBucketOfKey(`${OWNER}/other/x.png`)).toThrow();
    expect(() => stagingKeyOf(`${OWNER}/upload/x.png`)).toThrow();
    expect(() => stagingKeyOf('a/b')).toThrow();
  });
});
