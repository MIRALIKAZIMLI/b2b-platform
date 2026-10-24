// Ortam değişkeni şeması (docs/06-operations/environments-cicd.md §5).
// İlk hâli yalnızca veritabanı değişkenlerini içerir (F1.1a K4); F1.2 genişletir.
// Hata mesajları yalnızca değişken adını verir; değeri (adres, şifre) asla içermez.
import { z } from 'zod';

const postgresUrl = z.url({ protocol: /^postgres(ql)?$/ });

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

export type DbEnv = z.infer<typeof dbEnvSchema>;
export type MigratorEnv = z.infer<typeof migratorEnvSchema>;

type RawEnv = Record<string, string | undefined>;

function parseEnv<T extends z.ZodType>(schema: T, env: RawEnv): z.infer<T> {
  const result = schema.safeParse(env);
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
