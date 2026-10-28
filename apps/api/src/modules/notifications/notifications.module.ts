import { Global, Module } from '@nestjs/common';
import { DevicesController } from './devices.controller';
import { MailService } from './mail.service';
import { MobilePushService } from './mobile-push.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';

@Global()
@Module({
  controllers: [NotificationsController, DevicesController],
  providers: [NotificationsService, PushService, MailService, MobilePushService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
