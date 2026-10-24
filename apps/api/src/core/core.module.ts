// api ve worker'ın ortak altyapısı: log ve saat. HTTP'ye özgü parçalar (hata filtresi,
// istek kimliği) AppModule'dedir.
import { type DynamicModule, Global, Module } from '@nestjs/common';
import { Clock, SystemClock } from './clock';
import { IdGenerator, UuidV7IdGenerator } from './id-generator';
import { AppLoggerModule, type LoggerConfig } from './logging/logger.module';

@Global()
@Module({})
export class CoreModule {
  static forRoot(config: LoggerConfig): DynamicModule {
    return {
      module: CoreModule,
      imports: [AppLoggerModule.forRoot(config)],
      providers: [
        { provide: Clock, useClass: SystemClock },
        {
          provide: IdGenerator,
          useFactory: (clock: Clock) => new UuidV7IdGenerator(clock),
          inject: [Clock],
        },
      ],
      exports: [AppLoggerModule, Clock, IdGenerator],
    };
  }
}
