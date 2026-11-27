'use client';
// Stok (F3.10, US-038): openapi `/api/v1/stock-mode`, `/api/v1/variants/{id}/availability`.
// Yalnızca `packages/api-client`. İşaret değişince ürün önbelleğindeki varyant güncellenir (ürünün
// `updatedAt`'i değişmez: açık ürün formu sıfırlanmaz).
import type { components } from '@b2b/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { webApi } from '../../lib/session';
import { ApiError } from '../admin-sellers/api';
import { type Product, PRODUCTS_KEY } from '../products/api';

export type StockMode = components['schemas']['StockMode'];

export const STOCK_MODE_KEY = ['inventory', 'stock-mode'] as const;

const header = (businessId: string | undefined) => ({ 'X-Business-Id': businessId ?? '' });

export function useStockMode(businessId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: [...STOCK_MODE_KEY, businessId ?? null],
    enabled: enabled && businessId !== undefined,
    retry: false,
    queryFn: async (): Promise<StockMode> => {
      const { data, error, response } = await webApi.client.GET('/api/v1/stock-mode', {
        params: { header: header(businessId) },
      });
      if (data === undefined) throw new ApiError(error, response.status);
      return data.stockMode;
    },
  });
}

export function useSetVariantAvailability(businessId: string | undefined, productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { variantId: string; isAvailable: boolean }) => {
      const { data, error, response } = await webApi.client.PUT(
        '/api/v1/variants/{id}/availability',
        {
          params: { header: header(businessId), path: { id: input.variantId } },
          body: { isAvailable: input.isAvailable },
        },
      );
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
    onSuccess: (result) => {
      queryClient.setQueryData<Product>(
        [...PRODUCTS_KEY, 'detail', businessId ?? null, productId],
        (current) =>
          current === undefined
            ? current
            : {
                ...current,
                variants: current.variants.map((variant) =>
                  variant.id === result.variantId
                    ? { ...variant, isAvailable: result.isAvailable }
                    : variant,
                ),
              },
      );
    },
  });
}
