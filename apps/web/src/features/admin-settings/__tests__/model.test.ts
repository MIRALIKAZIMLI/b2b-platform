// F2.19: ayar ekranının saf kuralları (US-017).
import { describe, expect, it } from 'vitest';
import { checkDraft, draftOf, groupItems, rawValueOf, visibleItems } from '../model';

const items = [
  {
    key: 'connection.cooldown_after_reject_days',
    kind: 'int',
    scopes: ['platform', 'plan', 'business'],
  },
  { key: 'connection.request_ttl_days', kind: 'int', scopes: ['platform'] },
  { key: 'otp.max_attempts', kind: 'int', scopes: ['platform'] },
] as const;

describe('F2.19 ayar ekranı modeli', () => {
  it('F2.19-AC3: bekleme süresi 6 gün geçersiz, 7 gün geçerli', () => {
    const key = 'connection.cooldown_after_reject_days';
    expect(checkDraft(key, 'int', '6')).toEqual({ ok: false });
    expect(checkDraft(key, 'int', '7')).toEqual({ ok: true, value: 7 });
    expect(checkDraft(key, 'int', '7.5')).toEqual({ ok: false });
    expect(checkDraft(key, 'int', 'abc')).toEqual({ ok: false });
  });

  it('F2.19-AC1: liste, evet/hayır ve ülke kodu taslakları çevrilir', () => {
    expect(draftOf('int_list', [7, 30])).toBe('7, 30');
    expect(rawValueOf('int_list', '7, 30')).toEqual([7, 30]);
    expect(checkDraft('dormant.reminder_days', 'int_list', '30, 7')).toEqual({ ok: false });
    expect(draftOf('bool', false)).toBe('false');
    expect(checkDraft('system.maintenance', 'bool', 'true')).toEqual({ ok: true, value: true });
    expect(checkDraft('sms.allowed_country_codes', 'country_codes', '+994, +90')).toEqual({
      ok: true,
      value: ['+994', '+90'],
    });
    expect(checkDraft('mobile.store_url.ios', 'url', 'http://x.az')).toEqual({ ok: false });
  });

  it('F2.19-AC5: plan/işletme kapsamında yalnız kapsamı destekleyen anahtarlar; arama ad ve anahtarda', () => {
    const label = (key: string) => (key === 'otp.max_attempts' ? 'Səhv cəhd limiti' : key);
    expect(visibleItems(items, 'plan', '', label).map((item) => item.key)).toEqual([
      'connection.cooldown_after_reject_days',
    ]);
    expect(visibleItems(items, 'platform', 'səhv', label).map((item) => item.key)).toEqual([
      'otp.max_attempts',
    ]);
    expect(groupItems(items).map(([group, list]) => [group, list.length])).toEqual([
      ['connection', 2],
      ['otp', 1],
    ]);
  });
});
