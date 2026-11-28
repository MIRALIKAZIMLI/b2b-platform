import { ImportWizard } from '../../../../../../features/imports/import-wizard';
import { kindOf } from '../../../../../../features/imports/wizard-state';

/** Excel ile ürün, müşteri fiyatı ve stok sayımı içe aktarma sihirbazı (US-031, US-035, US-039; F3.5b, F3.7b, F3.11c); `?job=` açık işi gösterir. */
export default async function SellerProductImportRoute({
  searchParams,
}: {
  searchParams: Promise<{
    job?: string | string[];
    type?: string | string[];
    buyerId?: string | string[];
    warehouseId?: string | string[];
  }>;
}) {
  const { job, type, buyerId, warehouseId } = await searchParams;
  const uuid = (value: string | string[] | undefined) =>
    typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value) ? value : undefined;
  // F3.7b: müşterinin "Xüsusi qiymətlər" sayfasından `?type=customer_prices&buyerId=` ile gelinir;
  // F3.11c: stok ekranından `?type=stock&warehouseId=`.
  return (
    <ImportWizard
      initialJobId={uuid(job)}
      initialType={kindOf(typeof type === 'string' ? type : undefined)}
      initialBuyerId={uuid(buyerId)}
      initialWarehouseId={uuid(warehouseId)}
    />
  );
}
