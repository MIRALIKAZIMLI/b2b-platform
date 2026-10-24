import type { ErrorCode } from '@b2b/shared';

export type ErrorDetails = Readonly<Record<string, unknown>>;

/**
 * İş kuralı ihlali (coding-guidelines §6.1). Global filtre `code`'u HTTP durumuna eşler
 * (http-map.ts) ve `Error` şemasında döner. `details` istemciye gider: kişisel veri,
 * adres veya şifre konmaz.
 */
export class DomainError extends Error {
  override readonly name = 'DomainError';

  constructor(
    readonly code: ErrorCode,
    readonly details?: ErrorDetails,
  ) {
    super(code);
  }
}
