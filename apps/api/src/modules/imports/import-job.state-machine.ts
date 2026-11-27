import type { ImportJobStatus } from '@b2b/shared';
import { DomainError } from '../../core/errors/domain-error';

/**
 * state-machines.md §11: Excel içe aktarma işi. `preview_ready` işin süre dolumunda ve biten işin
 * saklama süresi sonunda silinmesi (SF-08, F3.5c S2) bir geçiş değildir; satır
 * `import_jobs_expire` ile kalkar. Worker yarıda kalan `validating`/`applying` işi yeniden dener
 * (durum değişmez, iş idempotent). F3.5c K10: ilerlemeyen `uploaded`/`validating`/`applying` iş
 * sistem işiyle `failed` (`TIMED_OUT`, `import_jobs_time_out`).
 */
const TRANSITIONS: Readonly<Record<ImportJobStatus, readonly ImportJobStatus[]>> = {
  uploaded: ['validating', 'failed'],
  validating: ['preview_ready', 'failed'],
  preview_ready: ['applying'],
  applying: ['done', 'failed'],
  done: [],
  failed: [],
};

export const ImportJobStateMachine = {
  canTransition(from: ImportJobStatus, to: ImportJobStatus): boolean {
    return TRANSITIONS[from].includes(to);
  },

  /** Tabloda olmayan geçiş `409 INVALID_STATE_TRANSITION`. */
  assertTransition(from: ImportJobStatus, to: ImportJobStatus): void {
    if (!this.canTransition(from, to)) throw new DomainError('INVALID_STATE_TRANSITION');
  },
};
