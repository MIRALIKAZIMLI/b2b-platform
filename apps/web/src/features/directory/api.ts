'use client';
// Perakendeci dizini (F2.11b, openapi `GET /api/v1/directory/buyers`). Yalnızca
// `packages/api-client`. Filtreli arama sayfalıdır ("daha fazla" → `nextCursor`); tam telefon /
// VÖEN araması tek istektir. Hız sınırında (429) `retryAfter` saniyesi hataya taşınır.
import type { components, paths } from '@b2b/api-client';
import type { ExactLookup } from '@b2b/shared';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { webApi } from '../../lib/session';
import { ApiError } from '../admin-sellers/api';

export type DirectoryBuyer = components['schemas']['DirectoryBuyer'];
type SearchPage =
  paths['/api/v1/directory/buyers']['get']['responses']['200']['content']['application/json'];
type SearchQuery = NonNullable<paths['/api/v1/directory/buyers']['get']['parameters']['query']>;

export interface DirectoryFilters {
  readonly q: string;
  readonly regionId: string;
  readonly activityTypeId: string;
  readonly verifiedOnly: boolean;
}

export const EMPTY_FILTERS: DirectoryFilters = {
  q: '',
  regionId: '',
  activityTypeId: '',
  verifiedOnly: false,
};

/** 429 yanıtındaki bekleme (sn); yoksa `undefined`. */
export function retryAfterOf(error: unknown): number | undefined {
  if (!(error instanceof ApiError) || error.code !== 'RATE_LIMITED') return undefined;
  const details = error.details;
  return typeof details === 'object' &&
    details !== null &&
    'retryAfter' in details &&
    typeof details.retryAfter === 'number'
    ? details.retryAfter
    : undefined;
}

async function fetchPage(businessId: string | undefined, query: SearchQuery): Promise<SearchPage> {
  const { data, error, response } = await webApi.client.GET('/api/v1/directory/buyers', {
    params: { header: { 'X-Business-Id': businessId ?? '' }, query },
  });
  if (data === undefined) throw new ApiError(error, response.status);
  return data;
}

export function useDirectorySearch(businessId: string | undefined, filters: DirectoryFilters) {
  return useInfiniteQuery({
    queryKey: ['directory', 'buyers', businessId ?? null, filters],
    enabled: businessId !== undefined,
    retry: false,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      fetchPage(businessId, {
        ...(filters.q.trim() === '' ? {} : { q: filters.q.trim() }),
        ...(filters.regionId === '' ? {} : { regionId: [filters.regionId] }),
        ...(filters.activityTypeId === '' ? {} : { activityTypeId: filters.activityTypeId }),
        ...(filters.verifiedOnly ? { verified: true } : {}),
        ...(pageParam === undefined ? {} : { cursor: pageParam }),
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useExactLookup(businessId: string | undefined, lookup: ExactLookup | undefined) {
  return useQuery({
    queryKey: ['directory', 'exact', businessId ?? null, lookup ?? null],
    enabled: businessId !== undefined && lookup !== undefined,
    retry: false,
    queryFn: () => fetchPage(businessId, { ...lookup }),
  });
}
