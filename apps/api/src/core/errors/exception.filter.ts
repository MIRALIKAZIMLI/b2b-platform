// Global hata filtresi (coding-guidelines §6). Her hata `Error` şemasında döner:
// { code, message, requestId, details? }.
// - DomainError → http-map.ts durumu
// - ZodError → 422 VALIDATION_FAILED, details: { alan: [mesaj] }
// - Nest HttpException ve Fastify hataları (bozuk JSON, bilinmeyen yol) → en yakın kod
// - Diğer her şey → 500 INTERNAL_ERROR; ayrıntı yalnızca logda.
// `message`: `errors.<CODE>` çevirisinin Accept-Language dilindeki değeri (F1.3, ErrorMessageResolver);
// çözücü yoksa veya hata verirse kodun kendisi.
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Inject,
  Optional,
} from '@nestjs/common';
import type { ErrorCode } from '@b2b/shared';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { ZodError } from 'zod';
import { ensureRequestId } from '../request-id.middleware';
import { DomainError, type ErrorDetails } from './domain-error';
import { ERROR_MESSAGE_RESOLVER, type ErrorMessageResolver } from './error-message.port';
import { httpStatusOf } from './http-map';

// Fastify istek/yanıt nesnelerinden kullanılan kısım (fastify doğrudan bağımlılık değil).
interface HttpRequest {
  readonly raw: IncomingMessage;
}
interface HttpReply {
  readonly raw: ServerResponse;
  status(statusCode: number): HttpReply;
  send(payload: unknown): unknown;
}

export interface ErrorBody {
  readonly code: ErrorCode;
  readonly message: string;
  readonly requestId: string;
  readonly details?: ErrorDetails;
}

interface Classified {
  readonly code: ErrorCode;
  readonly details?: ErrorDetails;
  /** Beklenmeyen hata: ayrıntısı `error` seviyesinde loglanır. */
  readonly unexpected: boolean;
}

function zodDetails(error: ZodError): ErrorDetails {
  const fields: Record<string, string[]> = {};
  const push = (field: string, message: string): void => {
    (fields[field] ??= []).push(message);
  };
  for (const issue of error.issues) {
    const base = issue.path.map(String).join('.');
    if (issue.code === 'unrecognized_keys') {
      // Bilinmeyen alanlar (strict) kendi adlarıyla listelenir.
      for (const key of issue.keys) push(base === '' ? key : `${base}.${key}`, issue.message);
    } else {
      push(base === '' ? '(root)' : base, issue.message);
    }
  }
  return fields;
}

/** HTTP durumundan (Nest veya Fastify hatası) en yakın ErrorCode. */
function codeForStatus(status: number): ErrorCode {
  if (status === 401) return 'UNAUTHENTICATED';
  if (status === 403) return 'PERMISSION_DENIED';
  if (status === 404 || status === 405) return 'NOT_FOUND';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 400 && status < 500) return 'VALIDATION_FAILED';
  return 'INTERNAL_ERROR';
}

function statusOfFrameworkError(error: unknown): number | undefined {
  if (error instanceof HttpException) {
    return error.getStatus();
  }
  // Fastify hataları (ör. FST_ERR_CTP_INVALID_JSON_BODY) `statusCode` taşır.
  if (error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number') {
    return error.statusCode;
  }
  return undefined;
}

export function classifyError(error: unknown): Classified {
  if (error instanceof DomainError) {
    return error.details === undefined
      ? { code: error.code, unexpected: false }
      : { code: error.code, details: error.details, unexpected: false };
  }
  if (error instanceof ZodError) {
    return { code: 'VALIDATION_FAILED', details: zodDetails(error), unexpected: false };
  }
  const status = statusOfFrameworkError(error);
  if (status !== undefined) {
    const code = codeForStatus(status);
    return { code, unexpected: code === 'INTERNAL_ERROR' };
  }
  return { code: 'INTERNAL_ERROR', unexpected: true };
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(
    @InjectPinoLogger(GlobalExceptionFilter.name) private readonly logger: PinoLogger,
    @Optional()
    @Inject(ERROR_MESSAGE_RESOLVER)
    private readonly messages: ErrorMessageResolver | null = null,
  ) {}

  async catch(error: unknown, host: ArgumentsHost): Promise<void> {
    const http = host.switchToHttp();
    const request = http.getRequest<HttpRequest>();
    const reply = http.getResponse<HttpReply>();
    const requestId = ensureRequestId(request.raw, reply.raw);
    const { code, details, unexpected } = classifyError(error);

    if (unexpected) {
      this.logger.error({ err: error, requestId }, 'unexpected error');
    }

    const body: ErrorBody = {
      code,
      message: await this.messageFor(code, request.raw.headers['accept-language']),
      requestId,
      ...(details === undefined ? {} : { details }),
    };
    reply.status(httpStatusOf(code)).send(body);
  }

  private async messageFor(code: ErrorCode, acceptLanguage: string | undefined): Promise<string> {
    if (this.messages === null) return code;
    try {
      return await this.messages.resolve(code, acceptLanguage);
    } catch (resolveError: unknown) {
      // Çözücü hata atmamalı; atarsa yanıt yine döner. Hata mesajı adres içerebilir, yazılmaz.
      const name = resolveError instanceof Error ? resolveError.name : 'unknown';
      this.logger.warn(`errors.message_fallback: hata mesajı çevrilemedi (${name})`);
      return code;
    }
  }
}
