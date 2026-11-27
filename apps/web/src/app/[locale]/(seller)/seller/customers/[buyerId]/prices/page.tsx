import { notFound } from 'next/navigation';
import { CustomerPricesPage } from '../../../../../../../features/prices/customer-prices-page';

/** Bir müşterinin özel fiyatları (US-035, F3.7b). */
export default async function SellerCustomerPricesRoute({
  params,
}: {
  params: Promise<{ buyerId: string }>;
}) {
  const { buyerId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(buyerId)) notFound();
  return <CustomerPricesPage buyerId={buyerId} />;
}
