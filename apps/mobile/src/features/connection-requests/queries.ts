// Bağlantı isteği sorguları (F2.12b). Hata, API gövdesiyle (`ConnectionRequestError.body`) döner;
// ekran `connectionRequestFailure` ile mesaja çevirir. Gönderme sayfası açılınca tek
// `Idempotency-Key` üretilir; yeniden denemede aynı kalır.
import { type ConnectionRequestStatus, formatDate } from '@b2b/shared';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { mobileApi } from '../../lib/session';
import { type ConnectionRequestBody, fetchOutgoing, postConnectionRequest } from './api';
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
    // Başarıda ve ilişkiyi değiştiren hatada kart durumu sunucudan yeniden okunur.
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['directory'] }),
        queryClient.invalidateQueries({ queryKey: OUTGOING_KEY }),
      ]),
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
  const canSend = (shell.me?.activeBusiness?.permissions ?? []).some(
    (item) => item.code === SEND_PERMISSION,
  );
  const chain = {
    user: shell.me?.timezone ?? null,
    business: shell.me?.activeBusiness?.timezone ?? null,
    country: COUNTRY_TIMEZONE,
  };
  return {
    businessId: shell.activeBusinessId,
    meLoaded: shell.me !== undefined,
    canSend,
    formatDay: (iso: string) => formatDate(iso, i18n.language, chain),
  };
}
