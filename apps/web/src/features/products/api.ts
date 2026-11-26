'use client';
// Toptancı ürün ekranları (F3.3b, US-030): openapi `/api/v1/products*`, `/api/v1/catalog/{units,
// categories,brands,brand-requests}`. Yalnız `packages/api-client` (coding-guidelines §9.1).
// POST tek `Idempotency-Key` ile (form açılınca üretilir, aynı denemede değişmez).
import type { components, paths } from '@b2b/api-client';
import type { ProductBody, ProductStatus } from '@b2b/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { webApi } from '../../lib/session';
import { ApiError } from '../admin-sellers/api';

export type Product = components['schemas']['Product'];
export type ProductImage = components['schemas']['ProductImage'];
export type ProductListItem = components['schemas']['ProductListItem'];
export type Unit = components['schemas']['Unit'];
export type Category = components['schemas']['Category'];
export type BrandOption = components['schemas']['BrandOption'];
export type BrandRequest = components['schemas']['BrandRequest'];
type ProductPage =
  paths['/api/v1/products']['get']['responses']['200']['content']['application/json'];
type ProductUpdateBody = components['schemas']['ProductUpdate'];

export const PRODUCTS_KEY = ['products'] as const;
const PAGE_SIZE = 20;
/** İşlenen görselin durumunu yenileme aralığı (arayüz yoklaması; iş kuralı değil). */
const IMAGE_POLL_MS = 2000;

const header = (businessId: string | undefined) => ({ 'X-Business-Id': businessId ?? '' });

export function useProducts(
  businessId: string | undefined,
  status: ProductStatus | undefined,
  q: string,
) {
  return useInfiniteQuery({
    queryKey: [...PRODUCTS_KEY, 'list', businessId ?? null, status ?? 'all', q],
    enabled: businessId !== undefined,
    retry: false,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }): Promise<ProductPage> => {
      const { data, error, response } = await webApi.client.GET('/api/v1/products', {
        params: {
          header: header(businessId),
          query: {
            limit: PAGE_SIZE,
            ...(status === undefined ? {} : { status }),
            ...(q === '' ? {} : { q }),
            ...(pageParam === undefined ? {} : { cursor: pageParam }),
          },
        },
      });
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useProduct(businessId: string | undefined, id: string | undefined) {
  return useQuery({
    queryKey: [...PRODUCTS_KEY, 'detail', businessId ?? null, id ?? null],
    enabled: businessId !== undefined && id !== undefined,
    retry: false,
    // F3.4b: worker küçültürken (`processing`) görsel durumu kısa aralıkla yenilenir.
    refetchInterval: (query) =>
      query.state.data?.images.some((image) => image.status === 'processing') === true
        ? IMAGE_POLL_MS
        : false,
    queryFn: async (): Promise<Product> => {
      const { data, error, response } = await webApi.client.GET('/api/v1/products/{id}', {
        params: { header: header(businessId), path: { id: id ?? '' } },
      });
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
  });
}

export function useProductMutations(businessId: string | undefined) {
  const queryClient = useQueryClient();
  const store = (product: Product) => {
    queryClient.setQueryData([...PRODUCTS_KEY, 'detail', businessId ?? null, product.id], product);
    void queryClient.invalidateQueries({ queryKey: [...PRODUCTS_KEY, 'list'] });
  };
  const create = useMutation({
    mutationFn: async ({ body, key }: { body: ProductBody; key: string }): Promise<Product> => {
      const { data, error, response } = await webApi.client.POST('/api/v1/products', {
        params: { header: { ...header(businessId), 'Idempotency-Key': key } },
        body,
      });
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
    onSuccess: store,
  });
  const update = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: ProductUpdateBody }): Promise<Product> => {
      const { data, error, response } = await webApi.client.PATCH('/api/v1/products/{id}', {
        params: { header: header(businessId), path: { id } },
        body,
      });
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
    onSuccess: store,
  });
  return { create, update };
}

/** Birimler, kategoriler, markalar: giriş yapmış her kullanıcı (işletme bağlamı gerekmez). */
export function useUnits() {
  return useQuery({
    queryKey: ['catalog', 'units'],
    retry: false,
    queryFn: async (): Promise<Unit[]> => {
      const { data, error, response } = await webApi.client.GET('/api/v1/catalog/units');
      if (data === undefined) throw new ApiError(error, response.status);
      return data.items;
    },
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ['catalog', 'categories'],
    retry: false,
    queryFn: async (): Promise<Category[]> => {
      const { data, error, response } = await webApi.client.GET('/api/v1/catalog/categories');
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
  });
}

export function useBrandOptions(q: string) {
  return useQuery({
    queryKey: ['catalog', 'brands', q],
    retry: false,
    queryFn: async (): Promise<BrandOption[]> => {
      const { data, error, response } = await webApi.client.GET('/api/v1/catalog/brands', {
        params: { query: { limit: 20, ...(q === '' ? {} : { q }) } },
      });
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
  });
}

const BRAND_REQUESTS_KEY = ['catalog', 'brand-requests'] as const;

export function useBrandRequests(businessId: string | undefined) {
  return useQuery({
    queryKey: [...BRAND_REQUESTS_KEY, businessId ?? null],
    enabled: businessId !== undefined,
    retry: false,
    queryFn: async (): Promise<BrandRequest[]> => {
      const { data, error, response } = await webApi.client.GET('/api/v1/catalog/brand-requests', {
        params: { header: header(businessId) },
      });
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
  });
}

/** US-029 AC2: marka talebi; 422 `name: [taken]`, günlük sınır 429. */
export function useRequestBrand(businessId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string): Promise<BrandRequest> => {
      const { data, error, response } = await webApi.client.POST('/api/v1/catalog/brands', {
        params: { header: header(businessId) },
        body: { name },
      });
      if (data === undefined) throw new ApiError(error, response.status);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BRAND_REQUESTS_KEY }),
  });
}

/** Ürün görseli için kabul edilen türler (API `files` ile aynı, NFR-49). */
export const PRODUCT_IMAGE_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/**
 * Yükleme adresi API'nin kendi yoluysa (`/api/v1/...`, yerel disk deposu) aynı kökenden çağrılır
 * (Next rewrite; CORS yok). R2 gibi başka alan adı olduğu gibi kullanılır.
 */
function sameOriginUploadUrl(url: string): string {
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.pathname.startsWith('/api/v1/') ? `${parsed.pathname}${parsed.search}` : url;
  } catch {
    return url;
  }
}

/**
 * Ürün görselleri (F3.4b, US-030 AC3): yükleme adresi → PUT → `complete` → `POST
 * /products/{id}/images` (F3.4a K1); sıra (K6) ve silme (K7). Her işlemden sonra ürün yeniden
 * okunur (görsel durumu ve adresleri ürün yanıtında).
 */
export function useProductImages(businessId: string | undefined, productId: string) {
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: [...PRODUCTS_KEY, 'detail', businessId ?? null, productId],
      }),
      queryClient.invalidateQueries({ queryKey: [...PRODUCTS_KEY, 'list'] }),
    ]);
  const params = { header: header(businessId), path: { id: productId } };
  const upload = useMutation({
    mutationFn: async (file: File): Promise<ProductImage> => {
      const ticket = await webApi.client.POST('/api/v1/files/upload-url', {
        params: { header: header(businessId) },
        body: { purpose: 'product_image', contentType: file.type, sizeBytes: file.size },
      });
      if (ticket.data === undefined) throw new ApiError(ticket.error, ticket.response.status);
      const put = await fetch(sameOriginUploadUrl(ticket.data.uploadUrl), {
        method: 'PUT',
        headers: ticket.data.headers,
        body: file,
      });
      if (!put.ok) throw new ApiError(undefined, put.status);
      const done = await webApi.client.POST('/api/v1/files/{id}/complete', {
        params: { header: header(businessId), path: { id: ticket.data.fileId } },
      });
      if (done.data === undefined) throw new ApiError(done.error, done.response.status);
      const added = await webApi.client.POST('/api/v1/products/{id}/images', {
        params,
        body: { fileId: ticket.data.fileId },
      });
      if (added.data === undefined) throw new ApiError(added.error, added.response.status);
      return added.data;
    },
    onSettled: refresh,
  });
  const reorder = useMutation({
    mutationFn: async (imageIds: string[]): Promise<void> => {
      const { error, response } = await webApi.client.PUT('/api/v1/products/{id}/images/order', {
        params,
        body: { imageIds },
      });
      if (!response.ok) throw new ApiError(error, response.status);
    },
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: async (imageId: string): Promise<void> => {
      const { error, response } = await webApi.client.DELETE(
        '/api/v1/products/{id}/images/{imageId}',
        { params: { header: header(businessId), path: { id: productId, imageId } } },
      );
      if (!response.ok) throw new ApiError(error, response.status);
    },
    onSettled: refresh,
  });
  return { upload, reorder, remove };
}
