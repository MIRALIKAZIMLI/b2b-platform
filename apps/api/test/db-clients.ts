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
