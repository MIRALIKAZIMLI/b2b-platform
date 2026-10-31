import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkDormantOrder,
  isSettingKey,
  parseSettingValue,
  SETTING_DEFINITIONS,
  SETTING_KEYS,
  settingDefault,
} from '../settings';

const USER_STORIES_FILE = resolve(__dirname, '../../../../docs/02-requirements/user-stories.md');

interface Us017Row {
  readonly keys: string[];
  readonly min: string;
  readonly max: string;
}

/** US-017 varsayılan değerler tablosunu okur (`feature.*` hariç). */
function readUs017Rows(): Us017Row[] {
  const text = readFileSync(USER_STORIES_FILE, 'utf8');
  const start = text.indexOf('### US-017');
  const end = text.indexOf('### US-018');
  const section = text.slice(start, end);
  const rows: Us017Row[] = [];
  for (const line of section.split(/\r?\n/)) {
    if (!line.startsWith('| `')) continue;
    const cells = line.split('|').map((cell) => cell.trim());
    const keys = [...(cells[1] ?? '').matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? '');
    if (keys.some((key) => key.endsWith('*'))) continue;
    rows.push({ keys, min: cells[4] ?? '', max: cells[5] ?? '' });
  }
  return rows;
}

describe('ayar kaydı (shared/settings.ts)', () => {
  it('F1.4-AC2: US-017 tablosundaki her anahtar kayıtta, kayıttaki her anahtar tabloda', () => {
    const tableKeys = readUs017Rows().flatMap((row) => row.keys);

    expect(tableKeys.length).toBeGreaterThan(0);
    expect([...tableKeys].sort()).toEqual([...SETTING_KEYS].sort());
  });

  it('F1.4-AC2: alt ve üst sınırlar US-017 tablosuyla aynı', () => {
    for (const row of readUs017Rows()) {
      for (const key of row.keys) {
        if (!isSettingKey(key)) throw new Error(`kayıtta yok: ${key}`);
        const definition = SETTING_DEFINITIONS[key];
        expect({ key, min: definition.min, max: definition.max }).toEqual({
          key,
          min: row.min === '—' ? undefined : Number(row.min),
          max: row.max === '—' ? undefined : Number(row.max),
        });
      }
    }
  });

  it('F1.4-AC2: her varsayılan kendi şemasından geçer', () => {
    for (const key of SETTING_KEYS) {
      expect(parseSettingValue(key, settingDefault(key))).toEqual({
        ok: true,
        value: settingDefault(key),
      });
    }
  });

  it('F1.4-AC2: varsayılanlar çapraz kurala uyar', () => {
    expect(
      checkDormantOrder({
        reminderDays: settingDefault('dormant.reminder_days'),
        warningDay: settingDefault('dormant.warning_day'),
        deactivateDay: settingDefault('dormant.deactivate_day'),
        deleteDay: settingDefault('dormant.delete_day'),
      }),
    ).toBe(true);
  });

  it('F1.4-AC2: US-017 varsayılan örnekleri', () => {
    expect(settingDefault('connection.cooldown_after_reject_days')).toBe(30);
    expect(settingDefault('dormant.reminder_days')).toEqual([7, 30]);
    expect(settingDefault('onboarding.seller_mode')).toBe('manual');
    expect(settingDefault('sms.allowed_country_codes')).toEqual(['+994']);
    expect(settingDefault('mobile.min_version.ios')).toBe('0.0.0');
    expect(settingDefault('system.maintenance')).toBe(false);
    expect(settingDefault('mobile.recommended_version.android')).toBe('0.0.0');
    expect(settingDefault('mobile.store_url.android')).toBe('');
    expect(settingDefault('idempotency.ttl_hours')).toBe(24);
    expect(settingDefault('outbox.max_attempts')).toBe(10);
    expect(settingDefault('outbox.poll_interval_ms')).toBe(1000);
    expect(settingDefault('settings.cache_ttl_seconds')).toBe(60);
  });

  it('F1.4-AC2: cooldown 6 gün → reddedilir, 7 gün kabul (US-017 AC3)', () => {
    expect(parseSettingValue('connection.cooldown_after_reject_days', 6)).toEqual({ ok: false });
    expect(parseSettingValue('connection.cooldown_after_buyer_cancel_days', 6)).toEqual({
      ok: false,
    });
    expect(parseSettingValue('connection.cooldown_after_reject_days', 7)).toEqual({
      ok: true,
      value: 7,
    });
  });

  it('F1.4-AC2: yanlış tip → reddedilir', () => {
    expect(parseSettingValue('connection.cooldown_after_reject_days', '30')).toEqual({ ok: false });
    expect(parseSettingValue('connection.cooldown_after_reject_days', 30.5)).toEqual({ ok: false });
    expect(parseSettingValue('connection.cooldown_after_reject_days', null)).toEqual({ ok: false });
    expect(parseSettingValue('system.maintenance', 'false')).toEqual({ ok: false });
    expect(parseSettingValue('onboarding.seller_mode', 'auto')).toEqual({ ok: false });
    expect(parseSettingValue('mobile.min_version.android', '1.2')).toEqual({ ok: false });
    expect(parseSettingValue('mobile.store_url.ios', 'http://example.com')).toEqual({ ok: false });
    expect(parseSettingValue('mobile.store_url.ios', 'javascript:alert(1)')).toEqual({ ok: false });
    expect(parseSettingValue('mobile.store_url.ios', 'https://example.com/app').ok).toBe(true);
    expect(parseSettingValue('sms.allowed_country_codes', ['994'])).toEqual({ ok: false });
    expect(parseSettingValue('sms.allowed_country_codes', [])).toEqual({ ok: false });
    expect(parseSettingValue('dormant.reminder_days', [30, 7])).toEqual({ ok: false });
    expect(parseSettingValue('dormant.reminder_days', [])).toEqual({ ok: false });
  });

  it('F1.4-AC2: üst sınır aşılırsa reddedilir', () => {
    expect(parseSettingValue('connection.block_rate_alert_pct', 101)).toEqual({ ok: false });
    expect(parseSettingValue('sms.daily_cap', 0)).toEqual({ ok: true, value: 0 });
    expect(parseSettingValue('sms.daily_cap', -1)).toEqual({ ok: false });
  });

  it('F1.4-AC2: çapraz kural ihlalleri', () => {
    const base = { reminderDays: [7, 30], warningDay: 90, deactivateDay: 120, deleteDay: 180 };

    expect(checkDormantOrder({ ...base, deactivateDay: 90 })).toBe(false);
    expect(checkDormantOrder({ ...base, deleteDay: 120 })).toBe(false);
    expect(checkDormantOrder({ ...base, reminderDays: [7, 90] })).toBe(false);
    expect(checkDormantOrder(base)).toBe(true);
  });

  it('bilinmeyen anahtar kayıtta değil', () => {
    expect(isSettingKey('connection.unknown')).toBe(false);
    expect(isSettingKey(42)).toBe(false);
    expect(isSettingKey('sms.daily_cap')).toBe(true);
  });
});
