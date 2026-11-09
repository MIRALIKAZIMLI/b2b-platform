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

/** TOTP_ENCRYPTION_KEY: base64, çözülünce tam 32 bayt (AES-256-GCM, F1.6). */
export const TOTP_ENCRYPTION_KEY_BYTES = 32;
const totpEncryptionKey = z
  .string()
  .regex(/^[A-Za-z0-9+/]+={0,2}$/)
  .refine((value) => base64ByteLength(value) === TOTP_ENCRYPTION_KEY_BYTES);

/** Base64 metnin çözülmüş bayt sayısı (Buffer gerekmez; istemci paketinde de derlenir). */
function base64ByteLength(value: string): number {
  if (value.length % 4 !== 0) return -1;
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return (value.length / 4) * 3 - padding;
}

const jwtKeyId = z.string().regex(/^[A-Za-z0-9._-]{1,64}$/);

/** Dosya deposu sağlayıcıları (integrations §4, ADR-0023). */
export const STORAGE_PROVIDERS = ['r2', 'local'] as const;
export type StorageProvider = (typeof STORAGE_PROVIDERS)[number];

/** Production'da kullanılamayan depo sağlayıcıları (ADR-0023 madde 3). */
const STORAGE_PROVIDERS_FORBIDDEN_IN_PRODUCTION: ReadonlySet<string> = new Set(['local']);

/** `STORAGE_PROVIDER=r2` iken zorunlu değişkenler (environments-cicd §5). */
const R2_REQUIRED_KEYS = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_PUBLIC',
  'R2_BUCKET_PRIVATE',
  'FILES_PUBLIC_BASE_URL',
] as const;

const bucketName = z.string().regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/);

/** Ortam `local`/`test` iken `MEILI_URL` verilmezse kullanılan adres (docker compose, F2.11a K5). */
export const MEILI_LOCAL_DEFAULT_URL = 'http://127.0.0.1:7700';

/** Meilisearch bağlantısı (F2.11a). `.env.example` değişmez; local/test'te adres varsayılandır. */
const searchEnvShape = {
  MEILI_URL: z.url({ protocol: /^https?$/ }).optional(),
  MEILI_MASTER_KEY: z.string().min(1).optional(),
};

interface SearchEnvInput {
  readonly APP_ENV: AppEnv;
  readonly MEILI_URL?: string | undefined;
  readonly MEILI_MASTER_KEY?: string | undefined;
}

/** staging/production'da adres ve anahtar zorunludur; production'da adres `https://` olmalıdır. */
function refineSearchEnv(env: SearchEnvInput, ctx: z.RefinementCtx): void {
  if (env.APP_ENV !== 'staging' && env.APP_ENV !== 'production') return;
  if (env.MEILI_URL === undefined) {
    ctx.addIssue({ code: 'custom', path: ['MEILI_URL'], message: 'zorunlu' });
  } else if (env.APP_ENV === 'production' && !env.MEILI_URL.startsWith('https://')) {
    ctx.addIssue({
      code: 'custom',
      path: ['MEILI_URL'],
      message: 'production ortamında https olmalı',
    });
  }
  if (env.MEILI_MASTER_KEY === undefined) {
    ctx.addIssue({ code: 'custom', path: ['MEILI_MASTER_KEY'], message: 'zorunlu' });
  }
}

/**
 * Yalnızca api sürecinin doğruladığı şema (F1.5a). Worker SMS göndermez, bu değişkenleri istemez.
 * Production'da `SMS_PROVIDER=mock` reddedilir: api açılmaz (NFR-97, ADR-0021).
 */
export const apiEnvSchema = serverEnvSchema
  .extend({
    SMS_PROVIDER: z.enum(SMS_PROVIDERS),
    /** Dizin araması (F2.11b) Meilisearch'e bağlanır; kurallar worker ile aynı (F2.11a K5). */
    ...searchEnvShape,
    /** OTP kod özeti (HMAC-SHA256) anahtarı; ortam başına ayrı ve rastgele. */
    OTP_HASH_KEY: z.string().min(OTP_HASH_KEY_MIN_LENGTH),
    /** Erişim anahtarı (JWT, HS256) imza anahtarı ve `kid` değeri (F1.5b). */
    JWT_SIGNING_KEY: z.string().min(JWT_SIGNING_KEY_MIN_LENGTH),
    JWT_KEY_ID: jwtKeyId,
    /** Döndürme: eski anahtar yalnızca doğrulamada kullanılır; ikisi birlikte verilir. */
    JWT_PREVIOUS_SIGNING_KEY: z.string().min(JWT_SIGNING_KEY_MIN_LENGTH).optional(),
    JWT_PREVIOUS_KEY_ID: jwtKeyId.optional(),
    /** TOTP sırrı şifreleme anahtarı (F1.6). */
    TOTP_ENCRYPTION_KEY: totpEncryptionKey,
    /** Dosya deposu (F1.10, ADR-0023): yerel/CI `local`, staging/production `r2`. */
    STORAGE_PROVIDER: z.enum(STORAGE_PROVIDERS),
    R2_ACCOUNT_ID: z
      .string()
      .regex(/^[A-Za-z0-9]{1,64}$/)
      .optional(),
    R2_ACCESS_KEY_ID: z.string().min(1).optional(),
    R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    R2_BUCKET_PUBLIC: bucketName.optional(),
    R2_BUCKET_PRIVATE: bucketName.optional(),
    /** Public bucket'ın CDN adresi (sonunda `/` yok). */
    FILES_PUBLIC_BASE_URL: z.url({ protocol: /^https?$/ }).optional(),
    /** `local` depo klasörü (göreli ise süreç klasörüne göre). */
    STORAGE_LOCAL_DIR: z.string().min(1).default('.local-storage'),
    /** `local` deponun imzalı bağlantılarında kullanılan API adresi; yoksa `http://localhost:<PORT>`. */
    STORAGE_LOCAL_BASE_URL: z.url({ protocol: /^https?$/ }).optional(),
    /** Web uygulamasının adresi (sonunda `/` yok); SMS'teki davet bağlantısı (F2.1a). */
    WEB_BASE_URL: z
      .url({ protocol: /^https?$/ })
      .refine((value) => !value.endsWith('/'), { message: 'sonunda / olmamalı' })
      .default('http://localhost:3000'),
  })
  .superRefine((env, ctx) => {
    refineSearchEnv(env, ctx);
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
    if (
      env.APP_ENV === 'production' &&
      STORAGE_PROVIDERS_FORBIDDEN_IN_PRODUCTION.has(env.STORAGE_PROVIDER)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['STORAGE_PROVIDER'],
        message: 'production ortamında yerel dosya deposu kullanılamaz',
      });
    }
    if (env.APP_ENV === 'production' && !env.WEB_BASE_URL.startsWith('https://')) {
      ctx.addIssue({
        code: 'custom',
        path: ['WEB_BASE_URL'],
        message: 'production ortamında https web adresi zorunlu',
      });
    }
    if (env.STORAGE_PROVIDER === 'r2') {
      for (const key of R2_REQUIRED_KEYS) {
        if (env[key] === undefined) {
          ctx.addIssue({ code: 'custom', path: [key], message: 'r2 deposu için zorunlu' });
        }
      }
    }
  });

/** `search:reindex` komutunun doğruladığı şema (F2.11a). */
export const searchEnvSchema = z
  .object({ APP_ENV: z.enum(APP_ENVS), ...searchEnvShape })
  .superRefine(refineSearchEnv);

/** Push sağlayıcıları (integrations §3, F1.11). */
export const PUSH_PROVIDERS = ['expo', 'mock'] as const;
export type PushProvider = (typeof PUSH_PROVIDERS)[number];

/** Production'da kullanılamayan push sağlayıcıları (F1.11, platform sahibi kararı). */
const PUSH_PROVIDERS_FORBIDDEN_IN_PRODUCTION: ReadonlySet<string> = new Set(['mock']);

/**
 * Yalnızca worker sürecinin doğruladığı şema (F1.11): push gönderimi worker'dadır.
 * Production'da `PUSH_PROVIDER=mock` reddedilir: worker açılmaz.
 */
export const workerEnvSchema = serverEnvSchema
  .extend({
    PUSH_PROVIDER: z.enum(PUSH_PROVIDERS),
    /** İsteğe bağlı: Expo hesabında "enhanced push security" açıksa gerekir. */
    EXPO_ACCESS_TOKEN: z.string().min(1).optional(),
    ...searchEnvShape,
  })
  .superRefine((env, ctx) => {
    refineSearchEnv(env, ctx);
    if (
      env.APP_ENV === 'production' &&
      PUSH_PROVIDERS_FORBIDDEN_IN_PRODUCTION.has(env.PUSH_PROVIDER)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['PUSH_PROVIDER'],
        message: 'production ortamında mock push sağlayıcısı kullanılamaz',
      });
    }
  });

export type DbEnv = z.infer<typeof dbEnvSchema>;
export type MigratorEnv = z.infer<typeof migratorEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type ApiEnv = z.infer<typeof apiEnvSchema>;
export type WorkerEnv = z.infer<typeof workerEnvSchema>;
export type SearchEnv = z.infer<typeof searchEnvSchema>;

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

export function parseWorkerEnv(env: RawEnv): WorkerEnv {
  return parseEnv(workerEnvSchema, env);
}

export function parseSearchEnv(env: RawEnv): SearchEnv {
  return parseEnv(searchEnvSchema, env);
}

/** `pnpm db:seed` için isteğe bağlı ilk süper admin telefonu (F1.6). Boş veya yoksa undefined. */
export const seedEnvSchema = z.object({
  SUPER_ADMIN_PHONE: z
    .string()
    .regex(/^\+[1-9][0-9]{7,14}$/)
    .optional(),
});

export type SeedEnv = z.infer<typeof seedEnvSchema>;

export function parseSeedEnv(env: RawEnv): SeedEnv {
  return parseEnv(seedEnvSchema, env);
}
