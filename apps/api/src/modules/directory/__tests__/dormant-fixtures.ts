// F2.17 test kurulumu: dizin fikstürleri üzerine toptancı/perakendeci ve bağlantı geçmişi
// (connections fikstürünün kısaltılmış kopyası; modül sınırı başka modülün test dosyasına erişime
// izin vermez). Genel satırlar platform bağlamında; P/T bağlantı satırları ilgili işletmenin
// bağlamında yazılır (bekçiler gereği).
import { randomUUID } from 'node:crypto';
import { connectAsMigrator } from '../../../../test/db-clients';
import { platformRows, runSeeds } from './fixtures';
import { addMember, newRegion, newSeller as newDirectorySeller } from './search-fixtures';

export { newRegion, platformRows, runSeeds };

export interface Member {
  readonly userId: string;
}

export interface Seller {
  readonly businessId: string;
  readonly admin: Member;
}

export type Buyer = Seller;

/** Onaylı, aktif toptancı + admin; hizmet bölgesi verilirse yazılır. */
export async function newSeller(regionId: string, serviceAreas: readonly string[] = []) {
  const seller = await newDirectorySeller(regionId, serviceAreas);
  return { businessId: seller.businessId, admin: { userId: seller.adminUserId } };
}

/** Onaylı `buyer` yetenekli perakendeci + admin (kişisel veri yok; testler ayrıca ekler). */
export async function newBuyer(regionId: string, listed = true): Promise<Buyer> {
  const businessId = randomUUID();
  await platformRows(
    `insert into businesses (id, legal_name, region_id, timezone, created_via)
     values ($1, $2, $3, 'Asia/Baku', 'self_signup')`,
    [businessId, `Market ${businessId.slice(0, 8)}`, regionId],
  );
  await platformRows(
    `insert into business_capabilities (business_id, capability, status, approved_at)
     values ($1, 'buyer', 'approved', now())`,
    [businessId],
  );
  await platformRows(
    `insert into buyer_profiles (business_id, activity_type_id, listed_in_directory)
     select $1, id, $2 from activity_types order by sort_order, id limit 1`,
    [businessId, listed],
  );
  await platformRows('insert into business_privacy (business_id) values ($1)', [businessId]);
  return { businessId, admin: { userId: await addMember(businessId, 'buyer_business_admin') } };
}

/** Bir işletmenin bağlamında (migrator, `app.business_id`) sorgu. */
async function businessRows(businessId: string, text: string, params: unknown[]): Promise<void> {
  const client = await connectAsMigrator();
  try {
    await client.query('begin');
    await client.query("select set_config('app.business_id', $1, true)", [businessId]);
    await client.query(text, params);
    await client.query('commit');
  } finally {
    await client.end();
  }
}

/** Geçmiş istek: satıcı bağlamında `pending`, yanıt alıcı bağlamında. */
export async function insertRequest(input: {
  readonly seller: Seller;
  readonly buyer: Buyer;
  readonly status: 'pending' | 'accepted' | 'rejected';
  readonly createdAt: Date;
}): Promise<string> {
  const id = randomUUID();
  await businessRows(
    input.seller.businessId,
    `insert into connection_requests
       (id, seller_id, buyer_id, sent_by_user_id, status, expires_at, seller_local_date,
        created_at, updated_at)
     values ($1, $2, $3, $4, 'pending', $5::timestamptz + interval '14 days', '2026-01-01', $5, $5)`,
    [
      id,
      input.seller.businessId,
      input.buyer.businessId,
      input.seller.admin.userId,
      input.createdAt,
    ],
  );
  if (input.status !== 'pending') {
    await businessRows(
      input.buyer.businessId,
      `update connection_requests set status = $2, responded_at = $3, responded_by_user_id = $4
        where id = $1`,
      [id, input.status, input.createdAt, input.buyer.admin.userId],
    );
  }
  return id;
}

/** Kabul edilmiş istekten bağlantı; ardından satıcı iptal eder (geçmiş bağlantı). */
export async function insertCancelledConnection(
  seller: Seller,
  buyer: Buyer,
  createdAt: Date,
): Promise<void> {
  const requestId = await insertRequest({ seller, buyer, status: 'accepted', createdAt });
  const id = randomUUID();
  await businessRows(
    buyer.businessId,
    `insert into connections (id, seller_id, buyer_id, request_id, status, started_at)
     select $1, $2, $3, $4, 'active', responded_at from connection_requests where id = $4`,
    [id, seller.businessId, buyer.businessId, requestId],
  );
  await businessRows(
    seller.businessId,
    `update connections set status = 'cancelled', ended_at = $2, ended_by_side = 'seller',
            end_reason = 'other', ended_by_user_id = $3
      where id = $1`,
    [id, new Date(createdAt.getTime() + 60_000), seller.admin.userId],
  );
}

export async function insertBlock(buyer: Buyer, seller: Seller): Promise<void> {
  await businessRows(
    buyer.businessId,
    'insert into blocks (buyer_id, seller_id, created_by_user_id) values ($1, $2, $3)',
    [buyer.businessId, seller.businessId, buyer.admin.userId],
  );
}
