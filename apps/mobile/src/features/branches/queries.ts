// Şubeler (F2.5b, US-010): openapi `/api/v1/branches*`. Yalnız `packages/api-client`. Hata, API
// gövdesini (`code`, `details`) taşıyan `BranchSaveError` olarak döner (409 nedenleri için).
import type { components } from '@b2b/api-client';
import type { BranchBody } from '@b2b/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { mobileApi } from '../../lib/session';

export type Branch = components['schemas']['Branch'];

export class BranchSaveError extends Error {
  constructor(readonly body: unknown) {
    super('BRANCH_SAVE_FAILED');
  }
}

const KEY = ['buyer', 'branches'] as const;
const header = (businessId: string | undefined) => ({
  header: { 'X-Business-Id': businessId ?? '' },
});

export function useBranches(businessId: string | undefined) {
  return useQuery({
    queryKey: [...KEY, businessId ?? null],
    enabled: businessId !== undefined,
    retry: false,
    queryFn: async (): Promise<Branch[]> => {
      const { data, error } = await mobileApi().client.GET('/api/v1/branches', {
        params: header(businessId),
      });
      if (data === undefined) throw new BranchSaveError(error);
      return data;
    },
  });
}

export function useBranchMutations(businessId: string | undefined) {
  const queryClient = useQueryClient();
  const onSettled = () => queryClient.invalidateQueries({ queryKey: [...KEY, businessId ?? null] });
  const create = useMutation({
    mutationFn: async (body: BranchBody): Promise<Branch> => {
      const { data, error } = await mobileApi().client.POST('/api/v1/branches', {
        params: header(businessId),
        body: body as components['schemas']['BranchInput'],
      });
      if (data === undefined) throw new BranchSaveError(error);
      return data;
    },
    onSettled,
  });
  const update = useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string;
      body: BranchBody & { status?: 'active' | 'inactive' };
    }): Promise<Branch> => {
      const { data, error } = await mobileApi().client.PATCH('/api/v1/branches/{id}', {
        params: { ...header(businessId), path: { id } },
        body,
      });
      if (data === undefined) throw new BranchSaveError(error);
      return data;
    },
    onSettled,
  });
  return { create, update };
}
