'use client';
// Tarih biçimi: platform kullanıcısının saat dilimi, yoksa ülke varsayılanı (US-059 AC2).
import { formatDate, type TimeZoneChain } from '@b2b/shared';
import { useLocale } from 'next-intl';
import { DEFAULT_TIMEZONE } from '../admin-sellers/form';
import { useShell } from '../shell/use-shell';

export function useFormatDay(): (iso: string) => string {
  const me = useShell().me;
  const locale = useLocale();
  const chain: TimeZoneChain = {
    user: me?.timezone ?? null,
    business: null,
    country: DEFAULT_TIMEZONE,
  };
  return (iso: string) => formatDate(iso, locale, chain);
}
