// F2.10 görünürlük ayarları (US-007 AC1–AC3): ortak liste, gövde şeması, fark hesabı.
import { describe, expect, it } from 'vitest';
import {
  ALWAYS_VISIBLE_FIELDS,
  changedPrivacyKeys,
  DEFAULT_PRIVACY,
  PRIVACY_FIELD_KEYS,
  privacyBodySchema,
} from '../privacy';

describe('privacy', () => {
  it('US-007-AC1: varsayılan dizinde görünür, ek alanların hepsi kapalı', () => {
    expect(DEFAULT_PRIVACY.listedInDirectory).toBe(true);
    for (const key of PRIVACY_FIELD_KEYS) expect(DEFAULT_PRIVACY[key]).toBe(false);
  });

  it('US-007-AC2: her ek alan tek tek açılabilir', () => {
    for (const key of PRIVACY_FIELD_KEYS) {
      const body = { ...DEFAULT_PRIVACY, [key]: true };
      expect(privacyBodySchema.parse(body)).toEqual(body);
      expect(changedPrivacyKeys(DEFAULT_PRIVACY, body)).toEqual([key]);
    }
  });

  it('US-007-AC3: ünvan, faaliyet alanı ve şehir/rayon için anahtar yok; gönderilirse reddedilir', () => {
    expect(ALWAYS_VISIBLE_FIELDS).toEqual(['legalName', 'activityType', 'region']);
    for (const key of ['showLegalName', 'showActivityType', 'showRegion']) {
      expect(privacyBodySchema.safeParse({ ...DEFAULT_PRIVACY, [key]: false }).success).toBe(false);
    }
  });

  it('F2.10-V2: eksik anahtar veya boolean olmayan değer reddedilir', () => {
    const missing: Record<string, boolean> = { ...DEFAULT_PRIVACY };
    delete missing.showVoen;
    expect(privacyBodySchema.safeParse(missing).success).toBe(false);
    expect(privacyBodySchema.safeParse({ ...DEFAULT_PRIVACY, showVoen: 'true' }).success).toBe(
      false,
    );
  });
});
