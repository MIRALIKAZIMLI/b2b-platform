import { Module } from '@nestjs/common';
import { AuditModule } from '../../core/audit';
import { OutboxModule } from '../../core/outbox';
import { AccessModule } from '../access';
import { BillingModule } from '../billing';
import { BusinessesModule } from '../businesses';
import { FilesModule } from '../files';
import { SettingsModule } from '../settings';
import { BlocksController } from './blocks.controller';
import { CONNECTION_CANCELLED_HANDLERS } from './connection-cancelled.handler';
import { ConnectionCancellationService } from './connection-cancellation.service';
import { ConnectionRelationsService } from './connection-relations.service';
import { ConnectionRequestsController } from './connection-requests.controller';
import { ConnectionRequestsService } from './connection-requests.service';
import { ConnectionResponsesService } from './connection-responses.service';
import { ConnectionTermsService } from './connection-terms.service';
import { ConnectionsController } from './connections.controller';
import { ConnectionsRepository } from './connections.repository';

/**
 * Bağlantı isteği (F2.12a): `POST /connection-requests`, `GET .../outgoing`; dizin ilişki
 * durumu (`ConnectionRelationsService`, directory → connections, c4 §1). F2.13a: gelen istekler,
 * kabul/red/geri çekme, engel listesi (`/blocks`); satıcı logosu için connections → files.
 * F2.14a: bağlantı listesi ve koşullar (`/connections`). F2.15a: iptal (`/connections/{id}/cancel`),
 * `ConnectionCancelledHandler` kancası.
 */
@Module({
  imports: [
    AccessModule,
    AuditModule,
    OutboxModule,
    BillingModule,
    BusinessesModule,
    FilesModule,
    SettingsModule,
  ],
  controllers: [ConnectionRequestsController, ConnectionsController, BlocksController],
  providers: [
    ConnectionsRepository,
    ConnectionRequestsService,
    ConnectionResponsesService,
    ConnectionTermsService,
    ConnectionRelationsService,
    ConnectionCancellationService,
    // F2.15a: kanca listesi; `cart` ve `orders` uygulamaları F4.5'te eklenir.
    { provide: CONNECTION_CANCELLED_HANDLERS, useValue: [] },
  ],
  exports: [ConnectionRelationsService],
})
export class ConnectionsModule {}
