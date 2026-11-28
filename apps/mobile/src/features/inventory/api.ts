// Depo stok istekleri — mobil (F3.11d; openapi F3.11a/b uçları: `/api/v1/stock/warehouses`,
// `/api/v1/stock/items`, `/api/v1/stock/movements`, `/api/v1/stock-mode`, `/api/v1/catalog/units`).
// Saf: istemci parametreyle gelir (test edilebilir, expo yok). Yalnız `packages/api-client`.
import type { ApiClient, components } from '@b2b/api-client';
import type { ManualStockMovementType, StockItemFilter } from '@b2b/shared';

export type StockMode = components['schemas']['StockMode'];
export type StockWarehouse = components['schemas']['StockWarehouse'];
export type StockItem = components['schemas']['StockItem'];
export type StockMovement = components['schemas']['StockMovement'];
export type Unit = components['schemas']['Unit'];

/** API hata gövdesinden `code` (yoksa `INTERNAL_ERROR`); ekran `errors.<code>` gösterir. */
export class StockError extends Error {
  readonly code: string;

  constructor(body: unknown) {
    const code =
      typeof body === 'object' && body !== null && 'code' in body && typeof body.code === 'string'
        ? body.code
        : 'INTERNAL_ERROR';
    super(code);
    this.code = code;
  }
}

const header = (businessId: string) => ({ 'X-Business-Id': businessId });

export async function fetchStockMode(client: ApiClient, businessId: string): Promise<StockMode> {
  const { data, error } = await client.GET('/api/v1/stock-mode', {
    params: { header: header(businessId) },
  });
  if (data === undefined) throw new StockError(error);
  return data.stockMode;
}

export async function fetchWarehouses(
  client: ApiClient,
  businessId: string,
): Promise<StockWarehouse[]> {
  const { data, error } = await client.GET('/api/v1/stock/warehouses', {
    params: { header: header(businessId) },
  });
  if (data === undefined) throw new StockError(error);
  return data;
}

export interface StockItemsParams {
  readonly warehouseId: string;
  readonly q: string;
  readonly filter: StockItemFilter;
  readonly cursor: string | undefined;
}

export async function fetchStockItems(
  client: ApiClient,
  businessId: string,
  params: StockItemsParams,
) {
  const q = params.q.trim();
  const { data, error } = await client.GET('/api/v1/stock/items', {
    params: {
      header: header(businessId),
      query: {
        warehouseId: params.warehouseId,
        filter: params.filter,
        limit: 30,
        ...(q === '' ? {} : { q }),
        ...(params.cursor === undefined ? {} : { cursor: params.cursor }),
      },
    },
  });
  if (data === undefined) throw new StockError(error);
  return data;
}

export async function fetchMovements(
  client: ApiClient,
  businessId: string,
  warehouseId: string,
  variantId: string,
  cursor: string | undefined,
) {
  const { data, error } = await client.GET('/api/v1/stock/movements', {
    params: {
      header: header(businessId),
      query: { warehouseId, variantId, limit: 20, ...(cursor === undefined ? {} : { cursor }) },
    },
  });
  if (data === undefined) throw new StockError(error);
  return data;
}

export interface MovementInput {
  readonly warehouseId: string;
  readonly variantId: string;
  readonly type: ManualStockMovementType;
  /** Temel birimde (F3.11a K1). */
  readonly qty: string;
  readonly lotNo?: string;
  readonly expiryDate?: string;
  readonly note?: string;
}

/**
 * Mal girişi / sayım. `idempotencyKey` sayfa açılışında bir kez üretilir: çift dokunuş veya
 * zayıf ağda yeniden deneme tek hareket yazar (F3.11a K8).
 */
export async function postMovement(
  client: ApiClient,
  businessId: string,
  input: MovementInput,
  idempotencyKey: string,
) {
  const { data, error } = await client.POST('/api/v1/stock/movements', {
    params: { header: { ...header(businessId), 'Idempotency-Key': idempotencyKey } },
    body: input,
  });
  if (data === undefined) throw new StockError(error);
  return data;
}

export async function fetchUnits(client: ApiClient): Promise<Unit[]> {
  const { data, error } = await client.GET('/api/v1/catalog/units');
  if (data === undefined) throw new StockError(error);
  return data.items;
}
