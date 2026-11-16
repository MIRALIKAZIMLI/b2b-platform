import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { adminSettingsQuerySchema, adminSettingUpdateSchema } from '../admin-settings';
import { SETTING_KEYS, settingMetaOf, settingScopesOf } from '../settings';

const STORIES = resolve(__dirname, '../../../../docs/02-requirements/user-stories.md');

/** US-017 "Kapsam (F2.19)" paragrafındaki anahtarlar. */
function layeredKeysInDocs(): string[] {
  const text = readFileSync(STORIES, 'utf8');
  const paragraph = text.split(/\r?\n/).find((line) => line.startsWith('**Kapsam (F2.19):**'));
  if (paragraph === undefined) throw new Error('US-017 Kapsam paragrafı yok');
  const firstSentence = paragraph.slice(0, paragraph.indexOf('Diğer anahtarlar'));
  return [...firstSentence.matchAll(/`([a-z0-9_.]+)`/g)].map((match) => match[1] ?? '').sort();
}

describe('F2.19 ayar kapsamları', () => {
  it('F2.19-AC5: plan/işletme kapsamı açık anahtarlar US-017 Kapsam paragrafıyla aynı', () => {
    const layered = SETTING_KEYS.filter((key) => settingScopesOf(key).length > 1).sort();
    expect(layered).toEqual(layeredKeysInDocs());
  });

  it('F2.19-AC5: diğer anahtarlar yalnız platform', () => {
    expect(settingScopesOf('otp.code_ttl_minutes')).toEqual(['platform']);
    expect(settingScopesOf('connection.request_ttl_days')).toEqual(['platform']);
  });

  it('F2.19-AC3: düzenleyici bilgisi sınırları taşır', () => {
    expect(settingMetaOf('connection.cooldown_after_reject_days')).toEqual({
      kind: 'int',
      min: 7,
      max: 365,
    });
    expect(settingMetaOf('onboarding.seller_mode')).toEqual({ kind: 'enum', options: ['manual'] });
    expect(settingMetaOf('mobile.store_url.ios').kind).toBe('url');
    expect(settingMetaOf('sms.allowed_country_codes').kind).toBe('country_codes');
    expect(settingMetaOf('push.retry_delays_minutes').kind).toBe('int_list');
  });
});

describe('F2.19 istek şemaları', () => {
  const id = '0190f3c4-0000-7000-8000-000000000001';

  it('F2.19-AC1: sorgu varsayılanı platform; plan ve işletme scopeId ister', () => {
    expect(adminSettingsQuerySchema.parse({})).toEqual({ scope: 'platform' });
    expect(adminSettingsQuerySchema.safeParse({ scope: 'plan' }).success).toBe(false);
    expect(adminSettingsQuerySchema.safeParse({ scope: 'platform', scopeId: id }).success).toBe(
      false,
    );
    expect(adminSettingsQuerySchema.parse({ scope: 'business', scopeId: id }).scopeId).toBe(id);
  });

  it('F2.19-AC1: gövde bilinmeyen anahtarı ve eksik scopeId’yi reddeder', () => {
    expect(
      adminSettingUpdateSchema.safeParse({ scope: 'platform', key: 'nope.key', value: 1 }).success,
    ).toBe(false);
    expect(
      adminSettingUpdateSchema.safeParse({ scope: 'plan', key: 'otp.max_attempts', value: 1 })
        .success,
    ).toBe(false);
    expect(
      adminSettingUpdateSchema.safeParse({
        scope: 'platform',
        scopeId: null,
        key: 'otp.max_attempts',
        value: 3,
      }).success,
    ).toBe(true);
  });
});
