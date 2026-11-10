// Entegrasyon testleri için doğrudan pg bağlantısı (yalnızca test). Uygulama kodu veritabanına
// yalnızca core/db üzerinden erişir; bu dosya src dışında olduğu için o kurala tabi değildir.
// Kullanım: aynı anda iki ayrı işlem gerektiren testler (ör. iki dağıtıcı, SKIP LOCKED).
import { Client } from 'pg';

/** RLS'e tabi `app_user` olarak yeni bir bağlantı açar (DATABASE_URL). */
export async function connectAsAppUser(): Promise<Client> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  return client;
}

/** Tablo sahibi `migrator` olarak yeni bir bağlantı açar (seed testleri; DATABASE_MIGRATOR_URL). */
export async function connectAsMigrator(): Promise<Client> {
  const client = new Client({ connectionString: process.env.DATABASE_MIGRATOR_URL });
  await client.connect();
  return client;
}

/**
 * RLS'i aşan süper kullanıcı bağlantısı (TEST_SUPERUSER_URL). Yalnız tetikleyici bekçilerinin
 * bağlamsız (`app.business_id` yok) yolunu sınamak için; uygulama bu rolü hiç kullanmaz.
 */
export async function connectAsSuperuser(): Promise<Client> {
  const client = new Client({ connectionString: process.env.TEST_SUPERUSER_URL });
  await client.connect();
  return client;
}
