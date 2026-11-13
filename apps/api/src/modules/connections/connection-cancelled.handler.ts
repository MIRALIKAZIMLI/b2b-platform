// `ConnectionCancelledHandler` kancası (c4 §ConnectionCancelledHandler, US-025 AC2–AC3). İptal eden
// işlemin İÇİNDE çağrılır: onay bekleyen siparişin aynı anda onaylanması yarışı olmasın diye sepet
// kalemleri ve `submitted` siparişler bağlantıyla aynı işlemde değişir. Arayüz `connections`'ta;
// uygulamaları `cart` ve `orders` F4.5'te `CONNECTION_CANCELLED_HANDLERS` listesine ekler
// (bağımlılık yönü: cart/orders → connections). Kanca hata verirse iptal geri alınır.
import type { Tx } from '../../core/db';

export interface ConnectionCancelledEvent {
  readonly connectionId: string;
  readonly sellerId: string;
  readonly buyerId: string;
  /** F2.18: `platform` = arşivlenen perakendecinin bağlantısını platform kapattı. */
  readonly endedBySide: 'seller' | 'buyer' | 'platform';
  readonly endedAt: Date;
  readonly endedByUserId: string;
}

export interface ConnectionCancelledEffect {
  /** Bu kancanın iptal ettiği `submitted` sipariş sayısı. */
  readonly cancelledOrders: number;
}

export interface ConnectionCancelledHandler {
  onConnectionCancelled(
    tx: Tx,
    event: ConnectionCancelledEvent,
  ): Promise<ConnectionCancelledEffect>;
}

/** DI belirteci: kanca listesi (F4.5'e kadar boş). */
export const CONNECTION_CANCELLED_HANDLERS = Symbol('CONNECTION_CANCELLED_HANDLERS');
