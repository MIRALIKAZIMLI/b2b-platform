'use client';
// Admin ayar uçları (F2.19 sözleşmesi; openapi `/api/v1/admin/settings`). Yalnızca
// `packages/api-client` üzerinden.
import type { components } from '@b2b/api-client';
import { pickLocalizedText, type SettingScope } from '@b2b/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { webApi } from '../../lib/session';
import { ApiError } from '../admin-sellers/api';

export type AdminSettingItem = components['schemas']['AdminSettingItem'];

const SETTINGS_KEY = ['admin', 'settings'] as const;

function fail(error: unknown, status: number): never {
  throw new ApiError(error, status);
}

export interface SettingsTarget {
  readonly scope: SettingScope;
  /** Plan veya işletme kimliği; platformda verilmez. */
  readonly scopeId?: string;
}

export function useAdminSettings(target: SettingsTarget, enabled: boolean) {
  return useQuery({
    queryKey: [...SETTINGS_KEY, target.scope, target.scopeId ?? null],
    enabled,
    queryFn: async () => {
      const { data, error, response } = await webApi.client.GET('/api/v1/admin/settings', {
        params: {
          query: {
            scope: target.scope,
            ...(target.scopeId === undefined ? {} : { scopeId: target.scopeId }),
          },
        },
      });
      if (data === undefined) fail(error, response.status);
      return data;
    },
  });
}

/** openapi `PUT /admin/settings` gövdesi; platformda `scopeId` yok. */
export interface SettingUpdateBody {
  readonly scope: SettingScope;
  readonly scopeId?: string;
  readonly key: string;
  readonly value: unknown;
}

export function useUpdateSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: SettingUpdateBody) => {
      const { data, error, response } = await webApi.client.PUT('/api/v1/admin/settings', {
        body,
      });
      if (data === undefined) fail(error, response.status);
      return data;
    },
    // Bir kapsamdaki değişiklik diğer kapsamların mirasını da değiştirir.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SETTINGS_KEY }),
  });
}

export interface PlanOption {
  readonly id: string;
  readonly label: string;
}

/** Kapsam seçici için bütün planlar (toptancı ve perakendeci; pasifler sonda). */
export function useAllPlanOptions(locale: string) {
  return useQuery({
    queryKey: ['admin', 'plans'],
    queryFn: async () => {
      const { data, error, response } = await webApi.client.GET('/api/v1/admin/plans');
      if (data === undefined) fail(error, response.status);
      return data.items;
    },
    select: (plans): PlanOption[] =>
      [...plans]
        .sort((a, b) => Number(b.isActive) - Number(a.isActive))
        .map((plan) => ({
          id: plan.id,
          label: `${pickLocalizedText(plan.name, locale) ?? plan.code} · ${plan.code}`,
        })),
  });
}
