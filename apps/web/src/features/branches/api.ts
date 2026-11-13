'use client';
// Şubeler (F2.5b, US-010): openapi `/api/v1/branches*`. Yalnızca `packages/api-client`. Yazımlar
// listeyi yeniler; ekip ekranı aynı sorguyu (şube seçimi) kullanır.
import type { components } from '@b2b/api-client';
import type { BranchBody } from '@b2b/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { webApi } from '../../lib/session';
import { ApiError } from '../admin-sellers/api';

export type Branch = components['schemas']['Branch'];

const BRANCHES_KEY = ['buyer', 'branches'] as const;

const header = (businessId: string | undefined) => ({
  header: { 'X-Business-Id': businessId ?? '' },
});

export function useBranches(businessId: string | undefined) {
  return useQuery({
    queryKey: [...BRANCHES_KEY, businessId ?? null],
    enabled: businessId !== undefined,
    retry: false,
    queryFn: async (): Promise<Branch[]> => {
      const { data, error, response } = await webApi.client.GET('/api/v1/branches', {
        params: header(businessId),
      });
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
  });
}

export interface BranchChange {
  readonly id: string;
  readonly body: BranchBody & { status?: 'active' | 'inactive' };
}

export function useBranchMutations(businessId: string | undefined) {
  const queryClient = useQueryClient();
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: [...BRANCHES_KEY, businessId ?? null] });
  };
  const create = useMutation({
    mutationFn: async (body: BranchBody): Promise<Branch> => {
      const { data, error, response } = await webApi.client.POST('/api/v1/branches', {
        params: header(businessId),
        body: body as components['schemas']['BranchInput'],
      });
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: async ({ id, body }: BranchChange): Promise<Branch> => {
      const { data, error, response } = await webApi.client.PATCH('/api/v1/branches/{id}', {
        params: { ...header(businessId), path: { id } },
        body,
      });
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
    onSuccess: refresh,
  });
  return { create, update };
}
