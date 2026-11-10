// F2.11a: Meilisearch `buyer_directory` uyarlayıcısı gerçek sunucuda (CI `integration` işinde
// servis container'ı, MEILI_URL). Yerelde Meilisearch yoksa atlanır; CI'da her zaman çalışır.
import { randomUUID } from 'node:crypto';
import { Meilisearch } from 'meilisearch';
import { afterAll, describe, expect, it } from 'vitest';
import { SystemClock } from '../../../core/clock';
import type { BuyerDirectoryDocument } from '../../../core/ports/buyer-directory-index';
import { MeiliBuyerDirectoryIndex } from '../meili-buyer-directory-index';

const url = process.env.MEILI_URL;
const runs = url !== undefined || process.env.CI === 'true';

function doc(overrides: Partial<BuyerDirectoryDocument> = {}): BuyerDirectoryDocument {
  return {
    id: randomUUID(),
    legalName: 'Leyla Market',
    activityTypeId: randomUUID(),
    regionId: randomUUID(),
    cityId: randomUUID(),
    verified: false,
    logoFileId: null,
    addressLine: null,
    businessPhone: null,
    voen: null,
    contactName: null,
    ...overrides,
  };
}

describe.runIf(runs)('F2.11a Meilisearch buyer_directory indeksi', () => {
  const host = url ?? 'http://127.0.0.1:7700';
  const apiKey = process.env.MEILI_MASTER_KEY;
  const prefix = `t${randomUUID().slice(0, 8)}_`;
  const index = new MeiliBuyerDirectoryIndex(
    { url: host, indexPrefix: prefix, ...(apiKey === undefined ? {} : { apiKey }) },
    new SystemClock(),
  );
  const client = new Meilisearch({ host, ...(apiKey === undefined ? {} : { apiKey }) });

  afterAll(async () => {
    const { results } = await client.getRawIndexes({ limit: 1000 });
    for (const raw of results.filter((r) => r.uid.startsWith(prefix))) {
      await client.deleteIndex(raw.uid).waitTask();
    }
  });

  it('F2.11a-AC1: upsert + filtre (bölge, şehir, faaliyet, doğrulanmış); remove siler', async () => {
    const a = doc({ verified: true });
    const b = doc({ cityId: a.cityId });
    await index.upsert([a, b]);

    const live = client.index<BuyerDirectoryDocument>(index.uid);
    const byCity = await live.search('', { filter: `cityId = "${a.cityId}"` });
    expect(byCity.hits.map((hit) => hit.id).sort()).toEqual([a.id, b.id].sort());
    const verified = await live.search('', {
      filter: `cityId = "${a.cityId}" AND verified = true`,
    });
    expect(verified.hits.map((hit) => hit.id)).toEqual([a.id]);
    const byActivity = await live.search('', { filter: `activityTypeId = "${b.activityTypeId}"` });
    expect(byActivity.hits.map((hit) => hit.id)).toEqual([b.id]);

    await index.remove([a.id, randomUUID()]);
    const after = await live.search('', { filter: `cityId = "${a.cityId}"` });
    expect(after.hits.map((hit) => hit.id)).toEqual([b.id]);
  });

  it('F2.11a-AC5 (US-020 AC2): telefon ve VÖEN aranabilir alan değil; kısmi metinle bulunmaz', async () => {
    const open = doc({ businessPhone: '+994125551020', voen: '1234567891' });
    await index.upsert([open]);
    const live = client.index<BuyerDirectoryDocument>(index.uid);
    const settings = await live.getSettings();
    expect(settings.searchableAttributes).toEqual(['legalName']);
    expect((await live.search('55510')).hits.map((hit) => hit.id)).not.toContain(open.id);
    expect((await live.search('1234567')).hits.map((hit) => hit.id)).not.toContain(open.id);
  });

  it('F2.11a-AC8: rebuild yeni indeksi takas eder; eski belge kalmaz, geçici indeks silinir', async () => {
    const stale = doc();
    await index.upsert([stale]);
    const fresh = doc();
    await index.rebuild(async (write) => {
      await write([fresh]);
    });

    const live = client.index<BuyerDirectoryDocument>(index.uid);
    const all = await live.search('', { limit: 1000 });
    expect(all.hits.map((hit) => hit.id)).toEqual([fresh.id]);
    expect((await live.getSettings()).filterableAttributes?.sort()).toEqual(
      ['activityTypeId', 'cityId', 'regionId', 'verified'].sort(),
    );
    const { results } = await client.getRawIndexes({ limit: 1000 });
    expect(results.filter((r) => r.uid.startsWith(`${index.uid}__rebuild_`))).toEqual([]);
  });

  it('F2.11a-AC8: rebuild hata verirse canlı indeks değişmez', async () => {
    const kept = doc();
    await index.rebuild(async (write) => {
      await write([kept]);
    });
    await expect(
      index.rebuild(async (write) => {
        await write([doc()]);
        throw new Error('doldurma hatası');
      }),
    ).rejects.toThrow('doldurma hatası');
    const all = await client.index<BuyerDirectoryDocument>(index.uid).search('', { limit: 1000 });
    expect(all.hits.map((hit) => hit.id)).toEqual([kept.id]);
  });

  it('F2.11b-AC1: search — bölge grupları (VE), şehir kapsar, faaliyet, doğrulanmış, ünvan, sayfa', async () => {
    const city = randomUUID();
    const district = randomUUID();
    const activity = randomUUID();
    const tag = randomUUID().slice(0, 8);
    const a = doc({ legalName: `Alma ${tag}`, regionId: district, cityId: city, verified: true });
    const b = doc({
      legalName: `Bəhər ${tag}`,
      regionId: city,
      cityId: city,
      activityTypeId: activity,
    });
    const c = doc({ legalName: `Cənnət ${tag}` });
    await index.upsert([a, b, c]);
    const base = {
      q: undefined,
      regionGroups: [] as string[][],
      activityTypeId: undefined,
      verified: undefined,
      offset: 0,
      limit: 20,
    };

    expect((await index.search({ ...base, regionGroups: [[city]] })).ids).toEqual([a.id, b.id]);
    expect((await index.search({ ...base, regionGroups: [[city], [district]] })).ids).toEqual([
      a.id,
    ]);
    expect((await index.search({ ...base, regionGroups: [[city], []] })).ids).toEqual([]);
    expect((await index.search({ ...base, activityTypeId: activity })).ids).toEqual([b.id]);
    expect((await index.search({ ...base, regionGroups: [[city]], verified: true })).ids).toEqual([
      a.id,
    ]);
    expect((await index.search({ ...base, q: `Cənnət ${tag}` })).ids[0]).toBe(c.id);
    const page = await index.search({ ...base, regionGroups: [[city]], limit: 1 });
    expect(page).toEqual({ ids: [a.id], hasMore: true });
    const next = await index.search({ ...base, regionGroups: [[city]], offset: 1, limit: 1 });
    expect(next).toEqual({ ids: [b.id], hasMore: false });
  });

  it('F2.11b: indeks yoksa arama boş döner; filtre değeri UUID değilse hata', async () => {
    const missing = new MeiliBuyerDirectoryIndex(
      { url: host, indexPrefix: `${prefix}none_`, ...(apiKey === undefined ? {} : { apiKey }) },
      new SystemClock(),
    );
    const query = {
      q: undefined,
      regionGroups: [],
      activityTypeId: undefined,
      verified: undefined,
      offset: 0,
      limit: 20,
    };
    expect(await missing.search(query)).toEqual({ ids: [], hasMore: false });
    await expect(
      index.search({ ...query, activityTypeId: '" OR verified = true' }),
    ).rejects.toThrow('UUID');
  });
});
