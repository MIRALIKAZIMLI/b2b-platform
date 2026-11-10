// Bağlantı isteği sorguları (F2.12b). Hata, API gövdesiyle (`ConnectionRequestError.body`) döner;
// ekran `connectionRequestFailure` ile mesaja çevirir. Gönderme sayfası açılınca tek
// `Idempotency-Key` üretilir; yeniden denemede aynı kalır.
import {
  type ConnectionRequestStatus,
  connectionRequestFailure,
  formatDate,
  incomingAccess,
  withPendingRelation,
} from '@b2b/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { mobileApi } from '../../lib/session';
import {
  type ConfirmAction,
  type ConnectionRequestBody,
  ConnectionRequestError,
  fetchBlocks,
  fetchIncoming,
  fetchOutgoing,
  postConnectionRequest,
  runConfirmAction,
} from './api';
import { useShell } from '../shell/use-shell';

export const OUTGOING_KEY = ['connection-requests', 'outgoing'] as const;
export const SEND_PERMISSION = 'connections.request.send';
/** Ülke saat dilimi (web `admin-sellers/form` DEFAULT_TIMEZONE ile aynı; US-059 AC2 zinciri). */
const COUNTRY_TIMEZONE = 'Asia/Baku';

export function useSendConnectionRequest(businessId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ body, key }: { body: ConnectionRequestBody; key: string }) =>
      postConnectionRequest(mobileApi().client, businessId ?? '', body, key),
    // Müfettiş 17 #59 L4: başarıda kart önbellekte yerinde "Gözləyir" olur (arama yeniden
    // çalışmaz); yalnız ilişkiyi değiştiren hatada dizin sunucudan okunur.
    onSuccess: (_data, { body }) => {
      queryClient.setQueriesData({ queryKey: ['directory'] }, (data: unknown) =>
        withPendingRelation(data, body.buyerId),
      );
    },
    onError: (error) => {
      const body = error instanceof ConnectionRequestError ? error.body : undefined;
      if (connectionRequestFailure(body).relationChanged) {
        void queryClient.invalidateQueries({ queryKey: ['directory'] });
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: OUTGOING_KEY }),
  });
}

export function useOutgoingRequests(
  businessId: string | undefined,
  status: ConnectionRequestStatus | undefined,
) {
  return useInfiniteQuery({
    queryKey: [...OUTGOING_KEY, businessId ?? null, status ?? 'all'],
    enabled: businessId !== undefined,
    retry: false,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      fetchOutgoing(mobileApi().client, businessId ?? '', status, pageParam),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/** Gönderme izni ve kullanıcının dili + saat dilimiyle tarih biçimi. */
export function useConnectionContext() {
  const shell = useShell();
  const { i18n } = useTranslation();
  const codes = (shell.me?.activeBusiness?.permissions ?? []).map((item) => item.code);
  const canSend = codes.includes(SEND_PERMISSION);
  const chain = {
    user: shell.me?.timezone ?? null,
    business: shell.me?.activeBusiness?.timezone ?? null,
    country: COUNTRY_TIMEZONE,
  };
  return {
    businessId: shell.activeBusinessId,
    meLoaded: shell.me !== undefined,
    canSend,
    /** Gelen istekler (F2.13b): görme, yanıtlama, engel (US-023 AC6). */
    access: incomingAccess(codes),
    language: i18n.language,
    formatDay: (iso: string) => formatDate(iso, i18n.language, chain),
  };
}

// ---- Gelen istekler ve engel (F2.13b) ----

export const INCOMING_KEY = ['connection-requests', 'incoming'] as const;
export const BLOCKS_KEY = ['blocks'] as const;

export function useIncomingRequests(businessId: string | undefined) {
  return useInfiniteQuery({
    queryKey: [...INCOMING_KEY, businessId ?? null],
    enabled: businessId !== undefined,
    retry: false,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => fetchIncoming(mobileApi().client, businessId ?? '', pageParam),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useBlocks(businessId: string | undefined) {
  return useQuery({
    queryKey: [...BLOCKS_KEY, businessId ?? null],
    enabled: businessId !== undefined,
    retry: false,
    queryFn: () => fetchBlocks(mobileApi().client, businessId ?? ''),
  });
}

export function useConfirmAction(businessId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ action, id, key }: { action: ConfirmAction; id: string; key: string }) =>
      runConfirmAction(mobileApi().client, businessId ?? '', action, id, key),
    // Başarıda ve hatada (istek artık bekleyen olmayabilir) listeler sunucudan okunur.
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: INCOMING_KEY }),
        queryClient.invalidateQueries({ queryKey: BLOCKS_KEY }),
        queryClient.invalidateQueries({ queryKey: OUTGOING_KEY }),
      ]),
  });
}
