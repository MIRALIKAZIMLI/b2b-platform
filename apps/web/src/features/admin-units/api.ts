'use client';
// Admin birim kataloğu (F3.1, US-028): openapi `/api/v1/admin/catalog/units*` ve
// `/unit-conversions*`. Yalnızca `packages/api-client` üzerinden (coding-guidelines §9.1).
import type { components } from '@b2b/api-client';
import type { UnitFormBody } from '@b2b/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { webApi } from '../../lib/session';
import { ApiError } from '../admin-sellers/api';

export type AdminUnit = components['schemas']['Unit'];
export type UnitConversion = components['schemas']['UnitConversion'];
export type UnitCatalog = components['schemas']['UnitCatalog'];
export type UnitPatchBody = Partial<Omit<UnitFormBody, 'code' | 'kind'>> & { isActive?: boolean };

const UNITS_KEY = ['admin', 'catalog', 'units'] as const;

export function useAdminUnits() {
  return useQuery({
    queryKey: UNITS_KEY,
    retry: false,
    queryFn: async (): Promise<UnitCatalog> => {
      const { data, error, response } = await webApi.client.GET('/api/v1/admin/catalog/units');
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
  });
}

export function useUnitMutations() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: UNITS_KEY });
  const create = useMutation({
    mutationFn: async (body: UnitFormBody): Promise<AdminUnit> => {
      const { data, error, response } = await webApi.client.POST('/api/v1/admin/catalog/units', {
        body,
      });
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: async ({
      code,
      body,
    }: {
      code: string;
      body: UnitPatchBody;
    }): Promise<AdminUnit> => {
      const { data, error, response } = await webApi.client.PATCH(
        '/api/v1/admin/catalog/units/{code}',
        { params: { path: { code } }, body },
      );
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
    onSuccess: refresh,
  });
  const saveConversion = useMutation({
    mutationFn: async (body: UnitConversion): Promise<UnitConversion> => {
      const { data, error, response } = await webApi.client.PUT(
        '/api/v1/admin/catalog/unit-conversions',
        { body },
      );
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
    onSuccess: refresh,
  });
  const removeConversion = useMutation({
    mutationFn: async ({ fromCode, toCode }: { fromCode: string; toCode: string }) => {
      const { error, response } = await webApi.client.DELETE(
        '/api/v1/admin/catalog/unit-conversions/{fromCode}/{toCode}',
        { params: { path: { fromCode, toCode } } },
      );
      if (!response.ok) throw new ApiError(error, response.status);
    },
    onSuccess: refresh,
  });
  return { create, update, saveConversion, removeConversion };
}
