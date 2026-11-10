'use client';
// Bağlantı isteği ekranlarının ortak bağlamı (F2.12b): gönderme izni ve tarih biçimi için saat
// dilimi zinciri (kullanıcı → işletme → ülke, US-059 AC2).
import { type ConnectionFailureMessage, formatDate, type TimeZoneChain } from '@b2b/shared';
import { useLocale, useTranslations } from 'next-intl';
import { DEFAULT_TIMEZONE } from '../admin-sellers/form';
import { useShell } from '../shell/use-shell';

export const SEND_PERMISSION = 'connections.request.send';

export function useConnectionContext() {
  const shell = useShell();
  const locale = useLocale();
  const timeZone: TimeZoneChain = {
    user: shell.me?.timezone ?? null,
    business: shell.me?.activeBusiness?.timezone ?? null,
    country: DEFAULT_TIMEZONE,
  };
  const canSend = (shell.me?.activeBusiness?.permissions ?? []).some(
    (item) => item.code === SEND_PERMISSION,
  );
  return {
    shell,
    locale,
    canSend,
    formatDay: (iso: string) => formatDate(iso, locale, timeZone),
  };
}

/** Hata mesajı → çevrilmiş metin (`{date}` kullanıcının dili ve saat diliyle). */
export function useFailureText(): (message: ConnectionFailureMessage) => string {
  const t = useTranslations();
  const { formatDay } = useConnectionContext();
  return (message) =>
    t(message.key, {
      ...(message.hours === undefined ? {} : { hours: message.hours }),
      ...(message.minutes === undefined ? {} : { minutes: message.minutes }),
      ...(message.until === undefined ? {} : { date: formatDay(message.until) }),
    });
}
