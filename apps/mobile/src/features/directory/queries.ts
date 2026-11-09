// Perakendeci dizini (F2.11b, openapi `GET /api/v1/directory/buyers`). Yalnız
// `packages/api-client`. Filtreli arama sayfalı (liste sonuna gelince sonraki sayfa); tam
// telefon / VÖEN araması tek istek. Hata, API gövdesi (`code`, `details.retryAfter`) ile döner.
import type { components, paths } from '@b2b/api-client';
import type { ExactLookup } from '@b2b/shared';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { mobileApi } from '../../lib/session';

export type DirectoryBuyer = components['schemas']['DirectoryBuyer'];
type Operation = paths['/api/v1/directory/buyers']['get'];
type SearchPage = Operation['responses']['200']['content']['application/json'];
type SearchQuery = NonNullable<Operation['parameters']['query']>;

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

export class DirectoryError extends Error {
  readonly code: string;
  /** 429'da bekleme (sn). */
  readonly retryAfter: number | undefined;

  constructor(body: unknown) {
    const object = typeof body === 'object' && body !== null ? body : {};
    const code =
      'code' in object && typeof object.code === 'string' ? object.code : 'INTERNAL_ERROR';
    super(code);
    this.code = code;
    const details = 'details' in object ? object.details : undefined;
    this.retryAfter =
      typeof details === 'object' &&
      details !== null &&
      'retryAfter' in details &&
      typeof details.retryAfter === 'number'
        ? details.retryAfter
        : undefined;
  }
}

async function fetchPage(businessId: string | undefined, query: SearchQuery): Promise<SearchPage> {
  const { data, error } = await mobileApi().client.GET('/api/v1/directory/buyers', {
    params: { header: { 'X-Business-Id': businessId ?? '' }, query },
  });
  if (data === undefined) throw new DirectoryError(error);
  return data;
}

/** Sorgu parametreleri; boş filtre gönderilmez (sunucu hizmet / atanmış bölgeleri uygular). */
export function searchQuery(filters: DirectoryFilters, cursor: string | undefined): SearchQuery {
  const q = filters.q.trim();
  return {
    ...(q === '' ? {} : { q }),
    ...(filters.regionId === '' ? {} : { regionId: [filters.regionId] }),
    ...(filters.activityTypeId === '' ? {} : { activityTypeId: filters.activityTypeId }),
    ...(filters.verifiedOnly ? { verified: true } : {}),
    ...(cursor === undefined ? {} : { cursor }),
  };
}

export function useDirectorySearch(
  businessId: string | undefined,
  filters: DirectoryFilters,
  enabled: boolean,
) {
  return useInfiniteQuery({
    queryKey: ['directory', 'buyers', businessId ?? null, filters],
    enabled: enabled && businessId !== undefined,
    retry: false,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => fetchPage(businessId, searchQuery(filters, pageParam)),
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
