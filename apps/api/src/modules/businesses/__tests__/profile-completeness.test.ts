import { describe, expect, it } from 'vitest';
import { PROFILE_FIELDS, profileCompleteness, SIGNUP_FILLED_FIELDS } from '../profile-completeness';

describe('profil doluluk yüzdesi (US-005 AC2, F2.3a K10 VARSAYIM)', () => {
  it('F2.3a-K10 kayıt anında 4/10 alan dolu → 40', () => {
    expect(profileCompleteness(SIGNUP_FILLED_FIELDS)).toBe(40);
  });

  it('F2.3a-K10 boş profil 0, tam profil 100', () => {
    expect(profileCompleteness(new Set())).toBe(0);
    expect(profileCompleteness(new Set(PROFILE_FIELDS))).toBe(100);
  });
});
