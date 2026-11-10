import { Module } from '@nestjs/common';
import { OutboxModule } from '../../core/outbox';
import { BillingModule } from '../billing';
import { BusinessesModule } from '../businesses';
import { SettingsModule } from '../settings';
import { ConnectionRelationsService } from './connection-relations.service';
import { ConnectionRequestsController } from './connection-requests.controller';
import { ConnectionRequestsService } from './connection-requests.service';
import { ConnectionsRepository } from './connections.repository';

/**
 * Bağlantı isteği (F2.12a): `POST /connection-requests`, `GET .../outgoing`; dizin ilişki
 * durumu (`ConnectionRelationsService`, directory → connections, c4 §1).
 */
@Module({
  imports: [OutboxModule, BillingModule, BusinessesModule, SettingsModule],
  controllers: [ConnectionRequestsController],
  providers: [ConnectionsRepository, ConnectionRequestsService, ConnectionRelationsService],
  exports: [ConnectionRelationsService],
})
export class ConnectionsModule {}
