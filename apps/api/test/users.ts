// Entegrasyon testleri için kullanıcı satırları (F1.5a). `settings.updated_by`,
// `businesses.verified_by`, `business_capabilities.approved_by`, `entitlement_overrides.created_by`
// users FK'sı taşır; bu sütunlara yazan testler önce işlemi yapan kullanıcıyı ekler.
// Tablo sahibi `migrator` ile ve platform bağlamında yazar (users FORCE RLS).
import { randomInt } from 'node:crypto';
import { Client } from 'pg';

/** Test için rastgele, geçerli bir Azerbaycan mobil numarası (+99450xxxxxxx). */
export function randomTestPhone(): string {
  return `+99450${randomInt(0, 10_000_000).toString().padStart(7, '0')}`;
}

/** Bilinen telefonla tek kullanıcı ekler (oturum testleri, F1.5b). */
export async function insertTestUser(input: {
  readonly id: string;
  readonly phone: string;
  readonly status?: 'active' | 'locked' | 'deleted';
}): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_MIGRATOR_URL });
  await client.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('app.is_platform', 'true', true)");
    await client.query(
      `insert into users (id, phone_e164, full_name, preferred_language, status)
       values ($1, $2, 'Test Kullanıcı', null, $3)`,
      [input.id, input.phone, input.status ?? 'active'],
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.end();
  }
}

/** Verilen kimliklerle kullanıcı ekler; var olanlar atlanır. */
export async function insertTestUsers(...ids: string[]): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_MIGRATOR_URL });
  await client.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('app.is_platform', 'true', true)");
    for (const id of ids) {
      await client.query(
        `insert into users (id, phone_e164, full_name) values ($1, $2, 'Test')
         on conflict (id) do nothing`,
        [id, randomTestPhone()],
      );
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.end();
  }
}
