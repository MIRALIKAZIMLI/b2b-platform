// Mock push gönderici (integrations §3): gönderilen mesajları yalnızca bellekte tutar.
// Token ve metin hiçbir zaman loglanmaz. Testler hata, bilet ve makbuz sonucunu ayarlayabilir.
import {
  type PushMessage,
  type PushReceipt,
  PushSender,
  type PushTicket,
} from '../../core/ports/push-sender';

export class MockPushSender extends PushSender {
  /** Başarıyla gönderilmiş mesajlar (sırayla). */
  readonly sent: PushMessage[] = [];
  /** Her `send` çağrısının grup boyu. */
  readonly batches: number[] = [];
  /** Test: `send` çağrısından önce çalışır; hata atarsa çağrı başarısız olur. */
  beforeSend: (messages: readonly PushMessage[]) => void = () => undefined;
  /** Test: mesaja özel bilet (varsayılan `ok`). */
  ticketFor: (message: PushMessage) => PushTicket | undefined = () => undefined;
  /** Test: bilete özel makbuz (varsayılan `ok`). */
  receiptFor: (ticketId: string) => PushReceipt | undefined = () => undefined;

  private nextTicket = 0;

  send(messages: readonly PushMessage[]): Promise<PushTicket[]> {
    try {
      this.beforeSend(messages);
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error('mock push hatası'));
    }
    this.batches.push(messages.length);
    const tickets = messages.map((message): PushTicket => {
      const custom = this.ticketFor(message);
      if (custom !== undefined) return custom;
      this.sent.push(message);
      this.nextTicket += 1;
      return { status: 'ok', ticketId: `mock-ticket-${String(this.nextTicket)}` };
    });
    return Promise.resolve(tickets);
  }

  getReceipts(ticketIds: readonly string[]): Promise<ReadonlyMap<string, PushReceipt>> {
    const result = new Map<string, PushReceipt>();
    for (const id of ticketIds) {
      result.set(id, this.receiptFor(id) ?? { status: 'ok' });
    }
    return Promise.resolve(result);
  }

  reset(): void {
    this.sent.length = 0;
    this.batches.length = 0;
    this.beforeSend = () => undefined;
    this.ticketFor = () => undefined;
    this.receiptFor = () => undefined;
  }
}
