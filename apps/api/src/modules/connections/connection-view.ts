// Bağlantı satırının API görünümü (openapi `Connection`; F2.13a, F2.14a). Alıcı bakışında koşullardan
// yalnız kredi limiti ve vade döner (F2.14a K5); fiyat listesi, şube fiyatı ve temsilci satıcıya özgü.
import type { ConnectionTermsSuggestion, ConnectionView } from '@b2b/shared';
import type { ConnectionRow } from './connections.repository';

export type ConnectionSide = 'seller' | 'buyer';

export function toConnectionView(
  row: ConnectionRow,
  side: ConnectionSide,
  counterpartyName: string | null,
  suggestedTerms?: ConnectionTermsSuggestion | null,
): ConnectionView {
  const termsAssigned = row.termsSetAt !== null;
  return {
    id: row.id,
    sellerId: row.sellerId,
    buyerId: row.buyerId,
    counterpartyName,
    status: row.status as ConnectionView['status'],
    termsAssigned,
    terms:
      side === 'seller'
        ? {
            priceListId: row.priceListId,
            branchPricingEnabled: row.branchPricingEnabled,
            creditLimit: row.creditLimit,
            paymentTermDays: row.paymentTermDays,
            salesRepMembershipId: row.salesRepMembershipId,
          }
        : { creditLimit: row.creditLimit, paymentTermDays: row.paymentTermDays },
    ...(side === 'seller' && suggestedTerms !== undefined ? { suggestedTerms } : {}),
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt === null ? null : row.endedAt.toISOString(),
    endedBySide: row.endedBySide as ConnectionView['endedBySide'],
  };
}
