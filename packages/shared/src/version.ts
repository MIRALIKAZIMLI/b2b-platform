// Uygulama sürümü karşılaştırması (US-060, F1.14b). Yalnızca `X.Y.Z` (ayar kaydındaki
// `versionSetting` biçimi); `semver` paketi tech-stack'te yok, ön sürüm etiketi desteklenmez.
const VERSION = /^(\d{1,4})\.(\d{1,4})\.(\d{1,4})$/;

export function isAppVersion(value: string): boolean {
  return VERSION.test(value);
}

function parts(value: string): [number, number, number] {
  const match = VERSION.exec(value);
  if (match === null) throw new RangeError('sürüm X.Y.Z biçiminde değil');
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** `a < b` → negatif, eşit → 0, `a > b` → pozitif. Biçim dışı değer → `RangeError`. */
export function compareVersions(a: string, b: string): number {
  const left = parts(a);
  const right = parts(b);
  for (let index = 0; index < 3; index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
