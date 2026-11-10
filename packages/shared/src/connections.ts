// Bağlantı isteği sözleşmesi (F2.12a; openapi `POST /api/v1/connection-requests`,
// `GET /api/v1/connection-requests/outgoing`, şema `ConnectionRequest`). İstemci ve sunucu ortak.
import { z } from 'zod';

export const CONNECTION_REQUEST_MESSAGE_MAX = 500;
export const CONNECTION_REQUEST_TERM_MAX_DAYS = 180;
export const CONNECTION_REQUEST_PAGE_MAX = 50;

export const CONNECTION_REQUEST_STATUSES = [
  'pending',
  'accepted',
  'rejected',
  'expired',
  'withdrawn',
] as const;
export type ConnectionRequestStatus = (typeof CONNECTION_REQUEST_STATUSES)[number];

/** İstek gövdesi; boş (yalnız boşluk) mesaj gönderilmemiş sayılır. */
export const connectionRequestCreateSchema = z
  .object({
    buyerId: z.uuid(),
    message: z
      .string()
      .trim()
      .max(CONNECTION_REQUEST_MESSAGE_MAX)
      .optional()
      .transform((value) => (value === undefined || value === '' ? undefined : value)),
    proposedPaymentTermDays: z
      .number()
      .int()
      .min(0)
      .max(CONNECTION_REQUEST_TERM_MAX_DAYS)
      .optional(),
  })
  .strict();
export type ConnectionRequestCreate = z.infer<typeof connectionRequestCreateSchema>;

export const outgoingConnectionRequestsQuerySchema = z
  .object({
    status: z.enum(CONNECTION_REQUEST_STATUSES).optional(),
    cursor: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(CONNECTION_REQUEST_PAGE_MAX).default(20),
  })
  .strict();
export type OutgoingConnectionRequestsQuery = z.infer<typeof outgoingConnectionRequestsQuerySchema>;

/** openapi `ConnectionRequest`. */
export interface ConnectionRequestView {
  readonly id: string;
  readonly sellerId: string;
  readonly buyerId: string;
  readonly status: ConnectionRequestStatus;
  readonly message: string | null;
  readonly proposedPaymentTermDays: number | null;
  readonly expiresAt: string;
  readonly createdAt: string;
}

/** Gönderilen istek: perakendecinin ünvanı (dizinde her zaman açık; işletme kapandıysa null). */
export interface OutgoingConnectionRequest extends ConnectionRequestView {
  readonly buyerName: string | null;
}

export interface OutgoingConnectionRequestPage {
  readonly items: readonly OutgoingConnectionRequest[];
  readonly nextCursor: string | null;
}
