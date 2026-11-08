'use client';
// Admin unvan ve rol şablonu kataloğu (F2.9b, US-012): openapi `/api/v1/admin/catalog/role-templates*`
// ve `/job-titles*`. Yalnızca `packages/api-client` üzerinden (coding-guidelines §9.1).
import type { components } from '@b2b/api-client';
import type { JobTitleFormBody, TemplateFormBody } from '@b2b/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { webApi } from '../../lib/session';
import { ApiError } from '../admin-sellers/api';

export type AdminRoleTemplate = components['schemas']['AdminRoleTemplate'];
export type AdminJobTitle = components['schemas']['AdminJobTitle'];

const TEMPLATES_KEY = ['admin', 'catalog', 'role-templates'] as const;
const TITLES_KEY = ['admin', 'catalog', 'job-titles'] as const;

export function useRoleTemplates() {
  return useQuery({
    queryKey: TEMPLATES_KEY,
    retry: false,
    queryFn: async (): Promise<AdminRoleTemplate[]> => {
      const { data, error, response } = await webApi.client.GET(
        '/api/v1/admin/catalog/role-templates',
      );
      if (data === undefined) throw new ApiError(error, response.status);
      return data.items;
    },
  });
}

export function useJobTitles() {
  return useQuery({
    queryKey: TITLES_KEY,
    retry: false,
    queryFn: async (): Promise<AdminJobTitle[]> => {
      const { data, error, response } = await webApi.client.GET('/api/v1/admin/catalog/job-titles');
      if (data === undefined) throw new ApiError(error, response.status);
      return data.items;
    },
  });
}

export function useTemplateMutations() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY });
  const create = useMutation({
    mutationFn: async (body: TemplateFormBody): Promise<AdminRoleTemplate> => {
      const { data, error, response } = await webApi.client.POST(
        '/api/v1/admin/catalog/role-templates',
        { body },
      );
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string;
      body: Omit<TemplateFormBody, 'code' | 'capability'>;
    }): Promise<AdminRoleTemplate> => {
      const { data, error, response } = await webApi.client.PATCH(
        '/api/v1/admin/catalog/role-templates/{id}',
        { params: { path: { id } }, body },
      );
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
    onSuccess: refresh,
  });
  return { create, update };
}

export function useJobTitleMutations() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: TITLES_KEY });
  const create = useMutation({
    mutationFn: async (body: JobTitleFormBody): Promise<AdminJobTitle> => {
      const { data, error, response } = await webApi.client.POST(
        '/api/v1/admin/catalog/job-titles',
        { body },
      );
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string;
      body: Partial<Omit<JobTitleFormBody, 'code' | 'capability'>> & { isActive?: boolean };
    }): Promise<AdminJobTitle> => {
      const { data, error, response } = await webApi.client.PATCH(
        '/api/v1/admin/catalog/job-titles/{id}',
        { params: { path: { id } }, body },
      );
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error, response } = await webApi.client.DELETE(
        '/api/v1/admin/catalog/job-titles/{id}',
        { params: { path: { id } } },
      );
      if (!response.ok) throw new ApiError(error, response.status);
    },
    onSuccess: refresh,
  });
  return { create, update, remove };
}
