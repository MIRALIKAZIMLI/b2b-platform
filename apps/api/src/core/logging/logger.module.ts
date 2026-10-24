// Yapılandırılmış log (observability.md §1, coding-guidelines §7): tek satır JSON, pino.
// Zorunlu alanlar: time (ISO, UTC), level, service, env, requestId; HTTP erişim logunda
// method, route, status, durationMs. Gizli alanlar redakte, telefon maskeli (NFR-66).
// İstek gövdesi, başlıklar ve sorgu dizesi hiç loglanmaz.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { type DynamicModule, Module, RequestMethod } from '@nestjs/common';
import type { ServerEnv } from '@b2b/shared';
import { LoggerModule } from 'nestjs-pino';
import pino, { type DestinationStream, type LoggerOptions } from 'pino';
import type { Options as PinoHttpOptions } from 'pino-http';
import { ensureRequestId } from '../request-id.middleware';
import { maskPhone } from './mask-phone';

export type ServiceName = 'api' | 'worker';

export interface LoggerConfig {
  readonly service: ServiceName;
  readonly env: Pick<ServerEnv, 'APP_ENV' | 'LOG_LEVEL'>;
  /** Testler için: loglar bu akışa yazılır (varsayılan stdout). */
  readonly stream?: DestinationStream;
}

const REDACTED = '[REDACTED]';

/** Değeri hiç yazılmayan alanlar (observability §1.2). */
const SECRET_KEYS = [
  'authorization',
  'cookie',
  'code',
  'otp',
  'token',
  'accessToken',
  'refreshToken',
  'password',
  'secret',
  // 🔒 person_data (data-model §5, F1.7)
  'contact_name',
  'contactName',
  'email',
];

/** Değeri maskelenerek yazılan alanlar (🔒 person_data.personal_phone dahil, F1.7). */
const PHONE_KEYS = ['phone', 'phone_e164', 'phoneE164', 'personal_phone', 'personalPhone'];

/** Alan, en çok üç düzey iç içe nesnede yakalanır (`a`, `*.a`, `*.*.a`). */
function atAnyDepth(keys: readonly string[]): string[] {
  return keys.flatMap((key) => [key, `*.${key}`, `*.*.${key}`]);
}

function censor(value: unknown, path: string[]): unknown {
  const key = path[path.length - 1];
  if (key !== undefined && PHONE_KEYS.includes(key) && typeof value === 'string') {
    return maskPhone(value);
  }
  return REDACTED;
}

/** İç içe `cause` zincirinde en çok bu kadar düzey izlenir. */
const MAX_CAUSE_DEPTH = 3;

export interface SafeSerializedError {
  readonly type: string;
  readonly sqlState?: string;
  readonly query?: string;
  readonly stack?: string;
  readonly cause?: SafeSerializedError;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Stack'ten mesaj satırları atılır; yalnızca `at ...` çerçeveleri kalır. */
function framesOnly(stack: unknown): string | undefined {
  if (typeof stack !== 'string') return undefined;
  const frames = stack.split('\n').filter((line) => /^\s+at /.test(line));
  return frames.length > 0 ? frames.join('\n') : undefined;
}

/**
 * Güvenli hata serileştirici (NFR-66): hata mesajı, sorgu parametreleri (`params`) ve
 * pg `detail` alanı kişisel veri (telefon, OTP, token) taşıyabildiği için hiç yazılmaz.
 * Yalnızca hata adı, SQLSTATE, yer tutuculu SQL metni ve mesajsız stack kalır.
 */
export function serializeError(error: unknown, depth = 0): SafeSerializedError {
  if (!isRecord(error)) return { type: typeof error };
  const name = typeof error.name === 'string' ? error.name : 'Error';
  const type =
    typeof error.constructor === 'function' && error.constructor.name !== 'Object'
      ? error.constructor.name
      : name;
  const code = error.code;
  const sqlState = typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code) ? code : undefined;
  const query = typeof error.query === 'string' ? error.query : undefined;
  const stack = framesOnly(error.stack);
  const cause =
    depth < MAX_CAUSE_DEPTH && error.cause !== undefined
      ? serializeError(error.cause, depth + 1)
      : undefined;
  return {
    type,
    ...(sqlState === undefined ? {} : { sqlState }),
    ...(query === undefined ? {} : { query }),
    ...(stack === undefined ? {} : { stack }),
    ...(cause === undefined ? {} : { cause }),
  };
}

const ERROR_SERIALIZERS = {
  err: (error: unknown) => serializeError(error),
  error: (error: unknown) => serializeError(error),
};

export function buildPinoOptions(config: Omit<LoggerConfig, 'stream'>): LoggerOptions {
  return {
    level: config.env.LOG_LEVEL,
    base: { service: config.service, env: config.env.APP_ENV },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
    redact: {
      paths: atAnyDepth([...SECRET_KEYS, ...PHONE_KEYS]),
      censor,
    },
    serializers: ERROR_SERIALIZERS,
  };
}

/** Sorgu dizesi atılır: telefon veya arama metni içerebilir. */
function routeOf(url: string | undefined): string {
  return (url ?? '').split('?')[0] ?? '';
}

function accessLog(
  req: IncomingMessage,
  res: ServerResponse,
  value: { durationMs?: number },
): object {
  return {
    method: req.method,
    route: routeOf(req.url),
    status: res.statusCode,
    durationMs: value.durationMs,
  };
}

function buildPinoHttpOptions(config: LoggerConfig): PinoHttpOptions {
  return {
    ...buildPinoOptions(config),
    genReqId: ensureRequestId,
    // İstek içindeki her log satırı yalnızca requestId taşır (req nesnesi değil).
    quietReqLogger: true,
    quietResLogger: true,
    customAttributeKeys: { reqId: 'requestId', responseTime: 'durationMs' },
    // Erişim logu düz alanlarla; başlık, gövde ve sorgu dizesi yok.
    customSuccessObject: accessLog,
    customErrorObject: (req, res, _error, value: { durationMs?: number }) =>
      accessLog(req, res, value),
    customSuccessMessage: () => 'request completed',
    customErrorMessage: () => 'request failed',
    serializers: {
      ...ERROR_SERIALIZERS,
      req: (req: { method?: string; url?: string }) => ({
        method: req.method,
        route: routeOf(req.url),
      }),
      res: (res: { statusCode?: number }) => ({ status: res.statusCode }),
    },
  };
}

const ALL_ROUTES = [{ path: '{*splat}', method: RequestMethod.ALL }];

@Module({})
export class AppLoggerModule {
  static forRoot(config: LoggerConfig): DynamicModule {
    const options = buildPinoHttpOptions(config);
    return {
      module: AppLoggerModule,
      imports: [
        LoggerModule.forRoot({
          pinoHttp: config.stream === undefined ? options : [options, config.stream],
          forRoutes: ALL_ROUTES,
        }),
      ],
      exports: [LoggerModule],
    };
  }
}
