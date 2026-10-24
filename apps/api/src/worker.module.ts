import { type DynamicModule, Module } from '@nestjs/common';
import type { ServerEnv } from '@b2b/shared';
import { CoreModule } from './core/core.module';

// Worker giriş noktasının modülü. İş kuyrukları (BullMQ) F1.2b ve sonrasında eklenir.
@Module({})
export class WorkerModule {
  static register(env: ServerEnv): DynamicModule {
    return {
      module: WorkerModule,
      imports: [CoreModule.forRoot({ service: 'worker', env })],
    };
  }
}
