// Saat servisi (coding-guidelines §3.10). Domain kodu `new Date()` yerine `Clock.now()` kullanır;
// testlerde `FixedClock` ile zaman kontrol edilir. Nest sağlayıcısı: `@Inject(Clock)`.

export abstract class Clock {
  /** Şimdiki an (UTC). */
  abstract now(): Date;
}

export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}

/** Testler için: verilen anda durur; `set` ve `advance` ile ilerletilir. */
export class FixedClock extends Clock {
  private current: number;

  constructor(start: Date) {
    super();
    this.current = start.getTime();
  }

  now(): Date {
    return new Date(this.current);
  }

  set(date: Date): void {
    this.current = date.getTime();
  }

  advance(milliseconds: number): void {
    this.current += milliseconds;
  }
}
