import { Module } from '@nestjs/common';
import { AuditModule } from '../../core/audit';
import { OutboxModule } from '../../core/outbox';
import { BillingModule } from '../billing';
import { BusinessesModule } from '../businesses';
import { FilesModule } from '../files';
import { SettingsModule } from '../settings';
import { BlocksController } from './blocks.controller';
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
 * F2.14a: bağlantı listesi ve koşullar (`/connections`).
 */
@Module({
  imports: [
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
  ],
  exports: [ConnectionRelationsService],
})
export class ConnectionsModule {}
