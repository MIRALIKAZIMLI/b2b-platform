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

export type DbEnv = z.infer<typeof dbEnvSchema>;
export type MigratorEnv = z.infer<typeof migratorEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

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
