'use client';
// Admin başvuru uçları (openapi `/api/v1/admin/seller-applications*`, F2.2a).
import type { components } from '@b2b/api-client';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { webApi } from '../../lib/session';
import { ApiError } from '../admin-sellers/api';

export type SellerApplication = components['schemas']['SellerApplication'];
export type ApplicationStatus = SellerApplication['status'];

export const APPLICATION_STATUSES: readonly ApplicationStatus[] = [
  'pending',
  'approved',
  'rejected',
];
export const APPLICATIONS_KEY = ['admin', 'seller-applications'] as const;
const PAGE_SIZE = 20;

export function useApplications(status: ApplicationStatus) {
  return useInfiniteQuery({
    queryKey: [...APPLICATIONS_KEY, status],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const { data, error, response } = await webApi.client.GET(
        '/api/v1/admin/seller-applications',
        {
          params: {
            query: {
              status,
              limit: PAGE_SIZE,
              ...(pageParam === undefined ? {} : { cursor: pageParam }),
            },
          },
        },
      );
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useRejectApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error, response } = await webApi.client.POST(
        '/api/v1/admin/seller-applications/{id}/reject',
        { params: { path: { id } } },
      );
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: APPLICATIONS_KEY }),
  });
}
