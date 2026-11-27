import { ImportWizard } from '../../../../../../features/imports/import-wizard';

/** Excel ile ürün içe aktarma sihirbazı (US-031, F3.5b); `?job=` açık işi gösterir. */
export default async function SellerProductImportRoute({
  searchParams,
}: {
  searchParams: Promise<{ job?: string | string[] }>;
}) {
  const { job } = await searchParams;
  const id = typeof job === 'string' && /^[0-9a-f-]{36}$/i.test(job) ? job : undefined;
  return <ImportWizard initialJobId={id} />;
}
