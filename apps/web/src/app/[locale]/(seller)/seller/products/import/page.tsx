import { ImportWizard } from '../../../../../../features/imports/import-wizard';

/** Excel ile ürün ve müşteri fiyatı içe aktarma sihirbazı (US-031, US-035; F3.5b, F3.7b); `?job=` açık işi gösterir. */
export default async function SellerProductImportRoute({
  searchParams,
}: {
  searchParams: Promise<{
    job?: string | string[];
    type?: string | string[];
    buyerId?: string | string[];
  }>;
}) {
  const { job, type, buyerId } = await searchParams;
  const uuid = (value: string | string[] | undefined) =>
    typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value) ? value : undefined;
  // F3.7b: müşterinin "Xüsusi qiymətlər" sayfasından `?type=customer_prices&buyerId=` ile gelinir.
  return (
    <ImportWizard
      initialJobId={uuid(job)}
      initialType={type === 'customer_prices' ? 'customer_prices' : 'products'}
      initialBuyerId={uuid(buyerId)}
    />
  );
}
