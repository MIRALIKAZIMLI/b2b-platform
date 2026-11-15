// Ayar anahtarı kaydı (ADR-0009 §4): her anahtarın tipi (Zod), varsayılanı ve alt/üst sınırı.
// Liste docs/02-requirements/user-stories.md US-017 tablosuyla birebir aynıdır (test: settings.test.ts).
// Yeni anahtar önce US-017 tablosuna, aynı PR'da buraya eklenir.
// Değeri okuyan kod `SettingsService.get` kullanır; sabit süre, kota veya eşik yazılmaz.
import { z } from 'zod';

export const SETTING_SCOPES = ['platform', 'plan', 'business'] as const;
export type SettingScope = (typeof SETTING_SCOPES)[number];

interface SettingDefinition<T> {
  readonly schema: z.ZodType<T>;
  readonly default: T;
  /** Sayısal alt sınır (liste ayarlarında her eleman için). */
  readonly min?: number;
  /** Sayısal üst sınır (liste ayarlarında her eleman için). */
  readonly max?: number;
}

function intSetting(defaultValue: number, min: number, max: number): SettingDefinition<number> {
  return { schema: z.number().int().min(min).max(max), default: defaultValue, min, max };
}

function boolSetting(defaultValue: boolean): SettingDefinition<boolean> {
  return { schema: z.boolean(), default: defaultValue };
}

function versionSetting(defaultValue: string): SettingDefinition<string> {
  return { schema: z.string().regex(/^\d{1,4}\.\d{1,4}\.\d{1,4}$/), default: defaultValue };
}

/** Boş metin (ayarlanmamış) veya `https://` adresi. */
function httpsUrlSetting(defaultValue: string): SettingDefinition<string> {
  const schema = z.union([z.literal(''), z.url({ protocol: /^https$/ }).max(500)]);
  return { schema, default: defaultValue };
}

/** Artan sırada (tekrarsız) tamsayı listesi. */
function increasingIntListSetting(
  defaultValue: number[],
  min: number,
  max: number,
  maxItems = 5,
): SettingDefinition<number[]> {
  const schema = z
    .array(z.number().int().min(min).max(max))
    .min(1)
    .max(maxItems)
    .refine((days) => days.every((day, index) => index === 0 || day > (days[index - 1] ?? day)));
  return { schema, default: defaultValue, min, max };
}

function enumSetting<const T extends readonly [string, ...string[]]>(
  options: T,
  defaultValue: T[number],
): SettingDefinition<T[number]> {
  return { schema: z.enum(options), default: defaultValue };
}

/** Telefon ülke kodu listesi (`+` ve 1–4 rakam). */
function countryCodeListSetting(defaultValue: string[]): SettingDefinition<string[]> {
  const schema = z
    .array(z.string().regex(/^\+\d{1,4}$/))
    .min(1)
    .max(20);
  return { schema, default: defaultValue };
}

export const SETTING_DEFINITIONS = {
  'connection.request_ttl_days': intSetting(14, 1, 90),
  'connection.cooldown_after_reject_days': intSetting(30, 7, 365),
  'connection.cooldown_after_buyer_cancel_days': intSetting(30, 7, 365),
  'connection.daily_request_quota': intSetting(20, 1, 1000),
  'connection.block_rate_alert_pct': intSetting(10, 1, 100),
  // F2.16: istek süre dolumu zamanlanmış işi (US-026 AC1; aralık worker açılışında okunur).
  'connection.request_expiry_interval_minutes': intSetting(15, 5, 60),
  'connection.request_expiry_batch_size': intSetting(500, 50, 1000),
  'connection.request_expiry_lock_seconds': intSetting(600, 60, 3600),
  'delivery.auto_confirm_hours': intSetting(48, 1, 720),
  'delivery.location_mismatch_meters': intSetting(300, 10, 10_000),
  // F2.17: en fazla 2 hatırlatma (aşamalar `reminded_7`, `reminded_30`; data-model `buyer_profiles`).
  'dormant.reminder_days': increasingIntListSetting([7, 30], 1, 3650, 2),
  'dormant.warning_day': intSetting(90, 1, 3650),
  'dormant.deactivate_day': intSetting(120, 1, 3650),
  'dormant.delete_day': intSetting(180, 1, 3650),
  // F2.17 (US-027): gece işi saati (UTC), parti boyu, kilit ömrü; giriş kancasının yazma aralığı.
  'dormant.job_hour_utc': intSetting(2, 0, 23),
  'dormant.batch_size': intSetting(500, 50, 1000),
  'dormant.lock_seconds': intSetting(1800, 60, 7200),
  'dormant.touch_min_interval_minutes': intSetting(60, 1, 1440),
  'invitation.seller_activation_days': intSetting(7, 1, 30),
  // F2.7: ekip davetinin geçerliliği (US-013 AC1; Mimar K10).
  'invitation.team_days': intSetting(7, 1, 30),
  'onboarding.seller_mode': enumSetting(['manual'] as const, 'manual'),
  'seller_application.ip_max_per_hour': intSetting(5, 1, 100),
  // F2.3a: kimliksiz perakendeci kaydı (US-005). IP başına saatlik sınır; kayıtta atanan ücretsiz
  // plan (ADR-0009 §3: kod plan adına dallanmaz, plan ayarla seçilir); güncel veri paylaşım metni
  // sürümü (NFR-63, docs/legal/data-sharing-v1.md). Yeni sürüm: önce metin, sonra seçenek.
  'buyer_registration.ip_max_per_hour': intSetting(10, 1, 100),
  'onboarding.buyer_plan_code': enumSetting(['buyer_free'] as const, 'buyer_free'),
  'legal.data_sharing_version': enumSetting(['v1'] as const, 'v1'),
  'sms.daily_cap': intSetting(500, 0, 100_000),
  'sms.allowed_country_codes': countryCodeListSetting(['+994']),
  'otp.code_ttl_minutes': intSetting(5, 1, 30),
  'otp.resend_interval_seconds': intSetting(60, 10, 600),
  'otp.max_per_hour': intSetting(5, 1, 50),
  'otp.max_attempts': intSetting(5, 1, 20),
  'otp.lock_minutes': intSetting(15, 1, 1440),
  'otp.ip_max_per_hour': intSetting(20, 1, 1000),
  'otp.fail_window_minutes': intSetting(60, 5, 1440),
  'auth.access_token_minutes': intSetting(15, 5, 60),
  'auth.refresh_token_days': intSetting(30, 1, 90),
  'access.permission_cache_seconds': intSetting(60, 1, 3600),
  'security.require_admin_2fa': boolSetting(false),
  'mobile.min_version.ios': versionSetting('0.0.0'),
  'mobile.min_version.android': versionSetting('0.0.0'),
  'mobile.recommended_version.ios': versionSetting('0.0.0'),
  'mobile.recommended_version.android': versionSetting('0.0.0'),
  'mobile.store_url.ios': httpsUrlSetting(''),
  'mobile.store_url.android': httpsUrlSetting(''),
  'system.maintenance': boolSetting(false),
  'idempotency.ttl_hours': intSetting(24, 1, 168),
  'idempotency.lock_seconds': intSetting(60, 5, 600),
  'outbox.max_attempts': intSetting(10, 1, 100),
  'outbox.poll_interval_ms': intSetting(1000, 100, 60_000),
  'outbox.batch_size': intSetting(100, 1, 1000),
  'push.retry_delays_minutes': increasingIntListSetting([1, 5, 15], 1, 1440),
  'push.receipt_check_minutes': intSetting(15, 1, 1440),
  'push.batch_size': intSetting(100, 1, 100),
  'files.upload_url_ttl_minutes': intSetting(10, 1, 60),
  'files.download_url_ttl_minutes': intSetting(5, 1, 60),
  'files.image_max_mb': intSetting(5, 1, 20),
  'files.xlsx_max_mb': intSetting(10, 1, 50),
  'settings.cache_ttl_seconds': intSetting(60, 1, 3600),
  'i18n.cache_ttl_seconds': intSetting(60, 1, 300),
  // F2.11a: perakendeci dizini gece tam yeniden indeksleme (ADR-0011 §1, §4).
  'directory.reindex_hour_utc': intSetting(1, 0, 23),
  'directory.reindex_batch_size': intSetting(500, 50, 1000),
  'directory.reindex_lock_seconds': intSetting(1800, 60, 7200),
  // F2.11b: kullanıcı başına dakikada dizin araması (US-019 AC5).
  'directory.search_max_per_minute': intSetting(60, 10, 600),
} as const satisfies Record<string, SettingDefinition<unknown>>;

type Definitions = typeof SETTING_DEFINITIONS;

export type SettingKey = keyof Definitions;
export type SettingValue<K extends SettingKey> =
  Definitions[K] extends SettingDefinition<infer T> ? T : never;

export const SETTING_KEYS = Object.keys(SETTING_DEFINITIONS) as SettingKey[];

const SETTING_KEY_SET: ReadonlySet<string> = new Set(SETTING_KEYS);

export function isSettingKey(value: unknown): value is SettingKey {
  return typeof value === 'string' && SETTING_KEY_SET.has(value);
}

/** Koddaki varsayılan (her çağrıda yeni kopya; liste değerleri değiştirilemez olsun diye). */
export function settingDefault<K extends SettingKey>(key: K): SettingValue<K> {
  return structuredClone(SETTING_DEFINITIONS[key].default) as SettingValue<K>;
}

export type ParseSettingResult<K extends SettingKey> =
  { readonly ok: true; readonly value: SettingValue<K> } | { readonly ok: false };

/** Değeri anahtarın tipine ve sınırlarına göre doğrular. Hata ayrıntısı döndürmez. */
export function parseSettingValue<K extends SettingKey>(
  key: K,
  raw: unknown,
): ParseSettingResult<K> {
  const definition: SettingDefinition<unknown> = SETTING_DEFINITIONS[key];
  const result = definition.schema.safeParse(raw);
  return result.success ? { ok: true, value: result.data as SettingValue<K> } : { ok: false };
}

/** Çapraz kural için `dormant.*` değerleri (aynı kapsamda geçerli olanlar). */
export interface DormantValues {
  readonly reminderDays: readonly number[];
  readonly warningDay: number;
  readonly deactivateDay: number;
  readonly deleteDay: number;
}

/** Hatırlatma günleri < uyarı < pasifleştirme < silme (US-017 çapraz kuralı). */
export function checkDormantOrder(values: DormantValues): boolean {
  return (
    values.reminderDays.every((day) => day < values.warningDay) &&
    values.warningDay < values.deactivateDay &&
    values.deactivateDay < values.deleteDay
  );
}

/** Çapraz kurala giren anahtarlar. */
export const DORMANT_SETTING_KEYS = [
  'dormant.reminder_days',
  'dormant.warning_day',
  'dormant.deactivate_day',
  'dormant.delete_day',
] as const satisfies readonly SettingKey[];
