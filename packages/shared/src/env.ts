// Ortam değişkeni şeması (docs/06-operations/environments-cicd.md §5).
// Yalnızca kullanılan değişkenler eklenir; diğerleri kendi adımlarında gelir.
// Hata mesajları yalnızca değişken adını verir; değeri (adres, şifre) asla içermez.
import { z } from 'zod';

const postgresUrl = z.url({ protocol: /^postgres(ql)?$/ });

export const APP_ENVS = ['local', 'test', 'staging', 'production'] as const;
export type AppEnv = (typeof APP_ENVS)[number];

export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export const dbEnvSchema = z.object({
  /** `app_user` rolüyle bağlantı (RLS'e tabi). */
  DATABASE_URL: postgresUrl,
  /** API ve worker bağlantı havuzu üst sınırı. */
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
});

export const migratorEnvSchema = z.object({
  /** `migrator` rolüyle bağlantı; yalnızca migration adımında. */
  DATABASE_MIGRATOR_URL: postgresUrl,
});

/** API ve worker süreçlerinin açılışta doğruladığı şema (F1.2a). */
export const serverEnvSchema = dbEnvSchema.extend({
  APP_ENV: z.enum(APP_ENVS),
  /** API dinleme portu. */
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  /** Redis (BullMQ, önbellek); F1.2b kullanır. */
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
});

/** SMS sağlayıcıları (integrations §2). Gerçek sağlayıcı adı F6.5'te eklenir. */
export const SMS_PROVIDERS = ['mock'] as const;
export type SmsProvider = (typeof SMS_PROVIDERS)[number];

/** Production'da kullanılamayan sağlayıcılar (NFR-97). */
const SMS_PROVIDERS_FORBIDDEN_IN_PRODUCTION: ReadonlySet<string> = new Set(['mock']);

/** OTP_HASH_KEY en az bu kadar karakter (F1.5a, Mimar kararı: en az 32 bayt). */
export const OTP_HASH_KEY_MIN_LENGTH = 32;

/** JWT imza anahtarı (HS256) en az bu kadar karakter (F1.5b, Mimar kararı K1). */
export const JWT_SIGNING_KEY_MIN_LENGTH = 32;

const jwtKeyId = z.string().regex(/^[A-Za-z0-9._-]{1,64}$/);

/**
 * Yalnızca api sürecinin doğruladığı şema (F1.5a). Worker SMS göndermez, bu değişkenleri istemez.
 * Production'da `SMS_PROVIDER=mock` reddedilir: api açılmaz (NFR-97, ADR-0021).
 */
export const apiEnvSchema = serverEnvSchema
  .extend({
    SMS_PROVIDER: z.enum(SMS_PROVIDERS),
    /** OTP kod özeti (HMAC-SHA256) anahtarı; ortam başına ayrı ve rastgele. */
    OTP_HASH_KEY: z.string().min(OTP_HASH_KEY_MIN_LENGTH),
    /** Erişim anahtarı (JWT, HS256) imza anahtarı ve `kid` değeri (F1.5b). */
    JWT_SIGNING_KEY: z.string().min(JWT_SIGNING_KEY_MIN_LENGTH),
    JWT_KEY_ID: jwtKeyId,
    /** Döndürme: eski anahtar yalnızca doğrulamada kullanılır; ikisi birlikte verilir. */
    JWT_PREVIOUS_SIGNING_KEY: z.string().min(JWT_SIGNING_KEY_MIN_LENGTH).optional(),
    JWT_PREVIOUS_KEY_ID: jwtKeyId.optional(),
  })
  .superRefine((env, ctx) => {
    if ((env.JWT_PREVIOUS_SIGNING_KEY === undefined) !== (env.JWT_PREVIOUS_KEY_ID === undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: [
          env.JWT_PREVIOUS_KEY_ID === undefined
            ? 'JWT_PREVIOUS_KEY_ID'
            : 'JWT_PREVIOUS_SIGNING_KEY',
        ],
        message: 'önceki JWT anahtarı ve kimliği birlikte verilir',
      });
    }
    if (env.JWT_PREVIOUS_KEY_ID !== undefined && env.JWT_PREVIOUS_KEY_ID === env.JWT_KEY_ID) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_PREVIOUS_KEY_ID'],
        message: 'önceki anahtar kimliği güncel kimlikle aynı olamaz',
      });
    }
    if (
      env.APP_ENV === 'production' &&
      SMS_PROVIDERS_FORBIDDEN_IN_PRODUCTION.has(env.SMS_PROVIDER)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['SMS_PROVIDER'],
        message: 'production ortamında mock SMS sağlayıcısı kullanılamaz',
      });
    }
  });

export type DbEnv = z.infer<typeof dbEnvSchema>;
export type MigratorEnv = z.infer<typeof migratorEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type ApiEnv = z.infer<typeof apiEnvSchema>;

type RawEnv = Record<string, string | undefined>;

function parseEnv<T extends z.ZodType>(schema: T, env: RawEnv): z.infer<T> {
  // Boş değer ("PORT=") verilmemiş sayılır; varsayılan varsa o kullanılır.
  const present = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ''));
  const result = schema.safeParse(present);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
    throw new Error(`Ortam değişkeni eksik veya geçersiz: ${names.join(', ')}`);
  }
  return result.data;
}

export function parseDbEnv(env: RawEnv): DbEnv {
  return parseEnv(dbEnvSchema, env);
}

export function parseMigratorEnv(env: RawEnv): MigratorEnv {
  return parseEnv(migratorEnvSchema, env);
}

export function parseServerEnv(env: RawEnv): ServerEnv {
  return parseEnv(serverEnvSchema, env);
}

export function parseApiEnv(env: RawEnv): ApiEnv {
  return parseEnv(apiEnvSchema, env);
}
