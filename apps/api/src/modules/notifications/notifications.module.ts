import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings';
import { NotificationDispatcher } from './notification-dispatcher';
import { BullNotificationJobs, NotificationJobs } from './notification-jobs';
import { NotificationsController } from './notifications.controller';
import { NotificationsProcessor } from './notifications.processor';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';

/** api: kullanıcının cihaz anahtarı, bildirim listesi, okundu ve tercihleri (F1.11). */
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsRepository, NotificationsService],
})
export class NotificationsModule {}

/**
 * Worker: `notifications` kuyruğu tüketicisi ve push gönderimi. `PushSender` global PushModule'den,
 * kuyruklar global QueueModule'den (OutboxDispatcherModule) gelir.
 */
@Module({
  imports: [SettingsModule],
  providers: [
    NotificationsRepository,
    NotificationDispatcher,
    NotificationsProcessor,
    { provide: NotificationJobs, useClass: BullNotificationJobs },
  ],
})
export class NotificationsWorkerModule {}
