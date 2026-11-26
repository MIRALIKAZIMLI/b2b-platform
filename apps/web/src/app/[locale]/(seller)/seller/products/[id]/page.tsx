import { ProductEditor } from '../../../../../../features/products/product-editor';

/** Ürün detayı ve düzenleme; yayın, arşiv, taslağa geri alma (US-030 AC6, F3.3b). */
export default async function SellerProductRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProductEditor productId={id} />;
}
