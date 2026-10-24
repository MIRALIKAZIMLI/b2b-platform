// Kimlik üreteci (data-model §1: `id uuid` UUIDv7, uygulama üretir; S5 = A).
// Zaman Clock'tan alınır, böylece testlerde FixedClock ile kimliğin zaman damgası bellidir.
// Nest sağlayıcısı: `@Inject(IdGenerator)` (CoreModule).
import { uuidv7 } from '@b2b/shared';
import { Clock } from './clock';

export abstract class IdGenerator {
  /** Yeni bir UUIDv7. */
  abstract next(): string;
}

export class UuidV7IdGenerator extends IdGenerator {
  constructor(private readonly clock: Clock) {
    super();
  }

  next(): string {
    return uuidv7(this.clock.now().getTime());
  }
}
