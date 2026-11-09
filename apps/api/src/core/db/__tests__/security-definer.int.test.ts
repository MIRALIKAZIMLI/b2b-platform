// Bütün SECURITY DEFINER fonksiyonları ve S tablolarının denetimi (F1 faz spesifikasyonu §6.6, D6).
// Yeni fonksiyon eklendikçe bu test onu da kapsar; beklenen ad listesi ayrıca doğrulanır.
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { checkRls } from '../check-rls';

interface FunctionRow {
  proname: string;
  owner: string;
  proconfig: string[] | null;
  public_exec: boolean;
  app_user_exec: boolean;
}

const EXPECTED_FUNCTIONS = [
  'dev_sms_outbox_insert',
  'dev_sms_outbox_list',
  'directory_buyer_documents',
  'directory_buyer_exact_match',
  'directory_buyer_page',
  'idempotency_complete',
  'idempotency_lookup_by_phone',
  'idempotency_release',
  'idempotency_reserve',
  'idempotency_store',
  'identity_record_login',
  'identity_user_by_phone',
  'invitation_accept',
  'list_my_memberships',
  'otp_challenge_close',
  'otp_challenge_create',
  'otp_challenge_fail',
  'otp_challenge_lock',
  'outbox_claim_batch',
  'outbox_mark_failed',
  'outbox_mark_processed',
  'platform_staff_role',
  'push_token_register',
  'seller_application_submit',
  'settings_get',
  'settings_put',
  'subscription_start_self_signup',
  'user_create_self_signup',
  'user_ensure_for_invitation',
  'user_session_rotate',
];

describe('SECURITY DEFINER fonksiyonları ve S tabloları', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: inject('migratorUrl') });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  it('D6: her fonksiyon migrator sahipli, search_path pg_temp ile biter, PUBLIC çalıştıramaz', async () => {
    const result = await client.query<FunctionRow>(`
      select p.proname,
             pg_get_userbyid(p.proowner) as owner,
             p.proconfig,
             has_function_privilege('public', p.oid, 'EXECUTE') as public_exec,
             has_function_privilege('app_user', p.oid, 'EXECUTE') as app_user_exec
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prosecdef
       order by p.proname
    `);

    expect(result.rows.map((row) => row.proname)).toEqual(EXPECTED_FUNCTIONS);
    for (const row of result.rows) {
      const searchPath = (row.proconfig ?? []).find((entry) => entry.startsWith('search_path='));
      expect(searchPath, row.proname).toBe('search_path=pg_catalog, public, pg_temp');
      expect(row.owner, row.proname).toBe('migrator');
      expect(row.public_exec, row.proname).toBe(false);
      expect(row.app_user_exec, row.proname).toBe(true);
    }
  });

  it('F1.2-AC10: check-rls geçer (outbox_events ve idempotency_keys dahil)', async () => {
    const result = await checkRls(client, { schemas: ['public'] });
    const tables = await client.query<{ table: string; comment: string | null }>(`
      select c.relname as table, obj_description(c.oid, 'pg_class') as comment
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname in ('outbox_events', 'idempotency_keys')
       order by 1
    `);

    // İzolasyon testlerinin kurduğu test_tenant_items de rls:T yorumu taşır; istisna gerekmez.
    expect(result.problems).toEqual([]);
    expect(tables.rows).toEqual([
      { table: 'idempotency_keys', comment: 'rls:S' },
      { table: 'outbox_events', comment: 'rls:S' },
    ]);
  });

  it('F1.2-AC10: app_user outbox_events için yalnızca INSERT ve dizi USAGE yetkisine sahip', async () => {
    const result = await client.query<Record<string, boolean>>(`
      select has_table_privilege('app_user', 'outbox_events', 'INSERT') as can_insert,
             has_any_column_privilege('app_user', 'outbox_events', 'SELECT') as can_select,
             has_table_privilege('app_user', 'outbox_events', 'UPDATE') as can_update,
             has_table_privilege('app_user', 'outbox_events', 'DELETE') as can_delete,
             has_sequence_privilege('app_user', 'outbox_events_id_seq', 'USAGE') as seq_usage,
             has_any_column_privilege('app_user', 'idempotency_keys', 'SELECT') as idem_select,
             has_table_privilege('app_user', 'idempotency_keys', 'INSERT') as idem_insert
    `);

    expect(result.rows[0]).toEqual({
      can_insert: true,
      can_select: false,
      can_update: false,
      can_delete: false,
      seq_usage: true,
      idem_select: false,
      idem_insert: false,
    });
  });
});
