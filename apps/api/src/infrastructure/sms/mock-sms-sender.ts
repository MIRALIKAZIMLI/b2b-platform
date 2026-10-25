// Mock SMS gönderici (ADR-0021, NFR-96): SMS göndermez, mesajı yalnızca `dev_sms_outbox`'a yazar.
// Mesaj (kod) ve telefon hiçbir zaman loglanmaz.
import { Clock } from '../../core/clock';
import { IdGenerator } from '../../core/id-generator';
import { SmsSender, type SmsMessage, type SmsSendResult } from '../../core/ports/sms-sender';
import type { DevSmsOutboxRepository } from './dev-sms-outbox.repository';

export class MockSmsSender extends SmsSender {
  constructor(
    private readonly outbox: Pick<DevSmsOutboxRepository, 'insert'>,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {
    super();
  }

  async send(message: SmsMessage): Promise<SmsSendResult> {
    const id = this.ids.next();
    await this.outbox.insert({
      id,
      phone: message.to,
      body: message.body,
      now: this.clock.now(),
    });
    return { providerMessageId: `mock:${id}` };
  }
}
