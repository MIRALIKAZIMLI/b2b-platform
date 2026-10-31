import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings';
import { AppConfigController } from './app-config.controller';
import { AppConfigService } from './app-config.service';

/** Mobil açılış yapılandırması: minimum/önerilen sürüm, mağaza bağlantısı, bakım (F1.14b). */
@Module({
  imports: [SettingsModule],
  controllers: [AppConfigController],
  providers: [AppConfigService],
})
export class AppConfigModule {}
