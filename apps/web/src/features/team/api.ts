'use client';
// Ekip yönetimi (F2.7b, US-013): openapi `/api/v1/team/*`. Yalnızca `packages/api-client`.
// Yazımlardan sonra üye ve davet listeleri birlikte yenilenir (davet kabulü / çıkarma ikisini de etkiler).
import type { components } from '@b2b/api-client';
import type { InvitationBody, MemberUpdateBody, RoleEditorBody } from '@b2b/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ME_KEY, webApi } from '../../lib/session';
import { ApiError } from '../admin-sellers/api';

export type TeamMember = components['schemas']['TeamMember'];
export type TeamInvitation = components['schemas']['TeamInvitation'];
export type TeamRole = components['schemas']['TeamRole'];
export type JobTitle = components['schemas']['JobTitle'];
export type RoleTemplate = components['schemas']['RoleTemplate'];

const TEAM_KEY = ['team'] as const;

const header = (businessId: string | undefined) => ({
  header: { 'X-Business-Id': businessId ?? '' },
});

function useTeamList<T>(
  businessId: string | undefined,
  name: string,
  load: () => Promise<{ data?: T; error?: unknown; response: Response }>,
) {
  return useQuery({
    queryKey: [...TEAM_KEY, name, businessId ?? null],
    enabled: businessId !== undefined,
    retry: false,
    queryFn: async (): Promise<T> => {
      const { data, error, response } = await load();
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
  });
}

export function useTeamMembers(businessId: string | undefined) {
  return useTeamList(businessId, 'members', () =>
    webApi.client.GET('/api/v1/team/members', { params: header(businessId) }),
  );
}

export function useTeamInvitations(businessId: string | undefined) {
  return useTeamList(businessId, 'invitations', () =>
    webApi.client.GET('/api/v1/team/invitations', { params: header(businessId) }),
  );
}

export function useTeamRoles(businessId: string | undefined) {
  return useTeamList(businessId, 'roles', () =>
    webApi.client.GET('/api/v1/team/roles', { params: header(businessId) }),
  );
}

export function useRoleTemplates(businessId: string | undefined) {
  return useTeamList(businessId, 'role-templates', () =>
    webApi.client.GET('/api/v1/team/role-templates', { params: header(businessId) }),
  );
}

export function useJobTitles(businessId: string | undefined) {
  return useTeamList(businessId, 'job-titles', () =>
    webApi.client.GET('/api/v1/team/job-titles', { params: header(businessId) }),
  );
}

export function useTeamMutations(businessId: string | undefined) {
  const queryClient = useQueryClient();
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: [...TEAM_KEY, 'members', businessId ?? null] });
    await queryClient.invalidateQueries({
      queryKey: [...TEAM_KEY, 'invitations', businessId ?? null],
    });
  };
  const invite = useMutation({
    mutationFn: async (body: InvitationBody) => {
      const { data, error, response } = await webApi.client.POST('/api/v1/team/invitations', {
        params: header(businessId),
        body,
      });
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
    onSuccess: refresh,
  });
  const revoke = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error, response } = await webApi.client.POST('/api/v1/team/invitations/{id}/revoke', {
        params: { ...header(businessId), path: { id } },
      });
      if (!response.ok) throw new ApiError(error, response.status);
    },
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string;
      body: MemberUpdateBody | { status: 'removed' };
    }): Promise<TeamMember> => {
      const { data, error, response } = await webApi.client.PATCH('/api/v1/team/members/{id}', {
        params: { ...header(businessId), path: { id } },
        body,
      });
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
    // F2.7c (Müfettiş #49 L1): kendi rolü / kapsamı değişince `/me` (menü, izinler) da yenilenir.
    onSuccess: async (member) => {
      await refresh();
      if (member.isSelf) await queryClient.invalidateQueries({ queryKey: ME_KEY });
    },
  });
  return { invite, revoke, update };
}

/**
 * Özel rol (F2.8, US-014). Yazımdan sonra roller yenilenir; izin değişikliği kendi rolünü de
 * etkileyebileceği için `/me` (menü, izinler) da yenilenir.
 */
export function useRoleMutations(businessId: string | undefined) {
  const queryClient = useQueryClient();
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: [...TEAM_KEY, 'roles', businessId ?? null] });
    await queryClient.invalidateQueries({ queryKey: ME_KEY });
  };
  const create = useMutation({
    mutationFn: async (body: RoleEditorBody & { templateId: string }): Promise<TeamRole> => {
      const { data, error, response } = await webApi.client.POST('/api/v1/team/roles', {
        params: header(businessId),
        body,
      });
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: RoleEditorBody }): Promise<TeamRole> => {
      const { data, error, response } = await webApi.client.PATCH('/api/v1/team/roles/{id}', {
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
