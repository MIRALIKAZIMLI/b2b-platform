'use client';
// Admin toptancı uçları (F2.1a sözleşmesi; openapi `/api/v1/admin/sellers*`, `/admin/plans`,
// `/catalog/regions`). Yalnızca `packages/api-client` üzerinden (coding-guidelines §9.1).
import type { components } from '@b2b/api-client';
import { pickLocalizedText } from '@b2b/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { webApi } from '../../lib/session';
import type { CreateSellerBody } from './form';

export type AdminSeller = components['schemas']['AdminSeller'];
type Region = components['schemas']['Region'];
type AdminPlan = components['schemas']['AdminPlan'];

export const SELLERS_KEY = ['admin', 'sellers'] as const;
const PAGE_SIZE = 20;

/** API hata gövdesi (`Error` şeması) istisna olarak; `errorCodeOf` / `apiFormErrors` okur. */
export class ApiError extends Error {
  readonly code: string;
  readonly details: unknown;

  constructor(body: unknown, status: number) {
    const code =
      typeof body === 'object' && body !== null && 'code' in body && typeof body.code === 'string'
        ? body.code
        : status === 403
          ? 'FORBIDDEN'
          : 'INTERNAL_ERROR';
    super(code);
    this.code = code;
    this.details =
      typeof body === 'object' && body !== null && 'details' in body ? body.details : undefined;
  }
}

function fail(error: unknown, status: number): never {
  throw new ApiError(error, status);
}

export function useSellers() {
  return useInfiniteQuery({
    queryKey: SELLERS_KEY,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const { data, error, response } = await webApi.client.GET('/api/v1/admin/sellers', {
        params: {
          query: { limit: PAGE_SIZE, ...(pageParam === undefined ? {} : { cursor: pageParam }) },
        },
      });
      if (data === undefined) fail(error, response.status);
      return data;
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export interface Option {
  readonly id: string;
  readonly label: string;
}

/** Bölgeler: şehir, rayon "şehir · rayon" etiketiyle (sıra API'den: önce şehirler). */
export function regionOptions(regions: readonly Region[], locale: string): Option[] {
  const name = (region: Region) => pickLocalizedText(region.name, locale) ?? region.id;
  const byId = new Map(regions.map((region) => [region.id, region]));
  return regions.map((region) => {
    const parent = region.parentId === null ? undefined : byId.get(region.parentId);
    return {
      id: region.id,
      label: parent === undefined ? name(region) : `${name(parent)} · ${name(region)}`,
    };
  });
}

export function useRegionOptions(locale: string) {
  return useQuery({
    queryKey: ['catalog', 'regions', 'AZ'],
    queryFn: async () => {
      const { data, error, response } = await webApi.client.GET('/api/v1/catalog/regions', {
        params: { query: { country: 'AZ' } },
      });
      if (data === undefined) fail(error, response.status);
      return data;
    },
    select: (regions) => regionOptions(regions, locale),
  });
}

/** Yalnız etkin `seller` planları (kart: "yalnız seller planları"). */
export function planOptions(plans: readonly AdminPlan[], locale: string): Option[] {
  return plans
    .filter((plan) => plan.capability === 'seller' && plan.isActive)
    .map((plan) => ({ id: plan.id, label: pickLocalizedText(plan.name, locale) ?? plan.code }));
}

export function usePlanOptions(locale: string) {
  return useQuery({
    queryKey: ['admin', 'plans'],
    queryFn: async () => {
      const { data, error, response } = await webApi.client.GET('/api/v1/admin/plans');
      if (data === undefined) fail(error, response.status);
      return data.items;
    },
    select: (plans) => planOptions(plans, locale),
  });
}

export function useCreateSeller() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateSellerBody) => {
      const { data, error, response } = await webApi.client.POST('/api/v1/admin/sellers', {
        body,
      });
      if (data === undefined) fail(error, response.status);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SELLERS_KEY }),
  });
}

/** US-009 AC3: yeni aktivasyon daveti (eski açık davetler geçersiz olur). */
export function useResendActivation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (businessId: string) => {
      const { data, error, response } = await webApi.client.POST(
        '/api/v1/admin/sellers/{id}/activation',
        { params: { path: { id: businessId } } },
      );
      if (data === undefined) fail(error, response.status);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SELLERS_KEY }),
  });
}
