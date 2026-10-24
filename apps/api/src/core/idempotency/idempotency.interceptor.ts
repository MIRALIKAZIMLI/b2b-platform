// İdempotens (design-doc "İdempotens", coding-guidelines §5.5, F1.2b kartı ve Kararlar K1–K5).
// `Idempotency-Key` başlığı olan, kimliği belli kullanıcıdan gelen POST isteklerinde çalışır:
//   aynı istek tekrar gelirse   → saklanan durum ve gövde (yalnızca 2xx saklanır)
//   aynı anahtar farklı istekle → 409 IDEMPOTENCY_CONFLICT
//   aynı istek hâlâ işleniyorsa → 409 IDEMPOTENCY_CONFLICT, details.reason = "in_progress"
// Kimliksiz istekte başlık yok sayılır (R13). Yanıt kaydı handler'ın işleminden ayrıdır (R12).
import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import { catchError, defer, from, mergeMap, type Observable, of, throwError } from 'rxjs';
import { z } from 'zod';
import { SettingsService } from '../../modules/settings';
import { Clock } from '../clock';
import { DomainError } from '../errors/domain-error';
import { serializeError } from '../logging/logger.module';
import { requestUserId } from '../request-user';
import {
  type IdempotencyLock,
  IdempotencyRepository,
  type ReserveResult,
} from './idempotency.repository';
import { requestHash } from './request-hash';

export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

// openapi.yaml → components.parameters.IdempotencyKey (16–64 karakter).
const headerSchema = z.object({ [IDEMPOTENCY_KEY_HEADER]: z.string().min(16).max(64) });

// Fastify istek/yanıt nesnelerinden kullanılan kısım (fastify doğrudan bağımlılık değil).
interface HttpRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly body?: unknown;
  readonly routeOptions?: { readonly url?: string };
  readonly user?: unknown;
}

interface HttpReply {
  readonly statusCode: number;
  status(statusCode: number): unknown;
}

const MS_PER_SECOND = 1000;
const MS_PER_HOUR = 60 * 60 * MS_PER_SECOND;

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value.join(',') : value;
}

/** Hata mesajı kişisel veri taşıyabilir; yalnızca tür ve SQLSTATE yazılır. */
function errorType(error: unknown): string {
  const safe = serializeError(error);
  return safe.sqlState === undefined ? safe.type : `${safe.type}/${safe.sqlState}`;
}

function isSuccess(statusCode: number): boolean {
  return statusCode >= 200 && statusCode < 300;
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(
    @Inject(IdempotencyRepository) private readonly repository: IdempotencyRepository,
    @Inject(SettingsService) private readonly settings: SettingsService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const http = context.switchToHttp();
    const request = http.getRequest<HttpRequest>();
    if (request.method !== 'POST') return next.handle();
    const rawKey = headerValue(request.headers[IDEMPOTENCY_KEY_HEADER.toLowerCase()]);
    if (rawKey === undefined) return next.handle();
    const userId = requestUserId(request);
    if (userId === undefined) return next.handle();

    const reply = http.getResponse<HttpReply>();
    return defer(() => from(this.begin(request, rawKey, userId))).pipe(
      mergeMap(({ lock, reserved }) => {
        switch (reserved.result) {
          case 'replay':
            reply.status(reserved.statusCode);
            return of(reserved.body);
          case 'conflict':
            return throwError(() => new DomainError('IDEMPOTENCY_CONFLICT'));
          case 'in_progress':
            return throwError(
              () => new DomainError('IDEMPOTENCY_CONFLICT', { reason: 'in_progress' }),
            );
          case 'reserved':
            return this.handle(next, reply, lock);
        }
      }),
    );
  }

  private async begin(
    request: HttpRequest,
    rawKey: string,
    userId: string,
  ): Promise<{ lock: IdempotencyLock; reserved: ReserveResult }> {
    const key = headerSchema.parse({ [IDEMPOTENCY_KEY_HEADER]: rawKey })[IDEMPOTENCY_KEY_HEADER];
    const [ttlHours, lockSeconds] = await Promise.all([
      this.settings.get('idempotency.ttl_hours'),
      this.settings.get('idempotency.lock_seconds'),
    ]);
    const now = this.clock.now();
    const path = request.url.split('?')[0] ?? request.url;
    const lock: IdempotencyLock = {
      key,
      userId,
      requestHash: requestHash({
        method: request.method,
        url: request.url,
        businessId: headerValue(request.headers['x-business-id']),
        body: request.body,
      }),
      lockedUntil: new Date(now.getTime() + lockSeconds * MS_PER_SECOND),
    };
    const reserved = await this.repository.reserve({
      ...lock,
      endpoint: `${request.method} ${request.routeOptions?.url ?? path}`,
      now,
      expiresAt: new Date(now.getTime() + ttlHours * MS_PER_HOUR),
    });
    return { lock, reserved };
  }

  private handle(next: CallHandler, reply: HttpReply, lock: IdempotencyLock): Observable<unknown> {
    return next.handle().pipe(
      mergeMap(async (body: unknown) => {
        if (isSuccess(reply.statusCode)) {
          await this.completeQuietly(lock, reply.statusCode, body);
        } else {
          await this.releaseQuietly(lock);
        }
        return body;
      }),
      catchError((error: unknown) =>
        from(this.releaseQuietly(lock)).pipe(mergeMap(() => throwError(() => error))),
      ),
    );
  }

  /** Yanıt kaydı başarısız olursa istemciye yine yanıt döner; durum loglanır (R12). */
  private async completeQuietly(
    lock: IdempotencyLock,
    statusCode: number,
    body: unknown,
  ): Promise<void> {
    try {
      const completed = await this.repository.complete(lock, statusCode, body);
      if (!completed) {
        this.logger.warn(
          'idempotency.lock_lost: kilit başka bir istek tarafından devralınmış, yanıt saklanmadı',
        );
      }
    } catch (error) {
      this.logger.error(
        `idempotency.complete_failed: yanıt saklanamadı (R12, hata: ${errorType(error)})`,
      );
    }
  }

  private async releaseQuietly(lock: IdempotencyLock): Promise<void> {
    try {
      await this.repository.release(lock);
    } catch (error) {
      this.logger.error(
        `idempotency.release_failed: kilit kaldırılamadı (hata: ${errorType(error)})`,
      );
    }
  }
}
