'use client';
// Dizin kartının alt satırı (F2.12b; US-021): ilişki durumu ve "Bağlantı sorğusu göndər".
// UX: durum tek satır, renkli nokta + metin (bekliyor amber, aktif emerald, engel/bekleme slate);
// düğme yalnız `canRequest` ve `connections.request.send` izniyle. Bekleme süresinde bitiş tarihi
// kullanıcının saat dilimiyle (US-021 AC5); engelde "Bu müəssisə sorğu qəbul etmir" (AC4).
import { type ConnectionRelation, relationView } from '@b2b/shared';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '../ui/primitives';
import { useConnectionContext } from './context';
import { SendRequestDialog } from './send-request-dialog';

const DOT = {
  pending: 'bg-amber-500 shadow-amber-500/40',
  active: 'bg-emerald-500 shadow-emerald-500/40',
  muted: 'bg-slate-400 shadow-slate-400/30',
} as const;

function Status({ tone, children }: { tone: keyof typeof DOT; children: string }) {
  return (
    <p className="flex items-center gap-2.5 text-sm font-medium text-slate-700">
      <span
        aria-hidden="true"
        className={`h-2 w-2 shrink-0 rounded-full shadow-[0_0_0_3px] ${DOT[tone]}`}
      />
      {children}
    </p>
  );
}

export function RelationFooter({
  buyerId,
  buyerName,
  relation,
}: {
  buyerId: string;
  buyerName: string;
  relation: ConnectionRelation;
}) {
  const t = useTranslations('connections');
  const { canSend, formatDay } = useConnectionContext();
  const [open, setOpen] = useState(false);
  const view = relationView(relation);

  const status =
    view.kind === 'pending' ? (
      <Status tone="pending">{t('relation.pending')}</Status>
    ) : view.kind === 'active' ? (
      <Status tone="active">{t('relation.active')}</Status>
    ) : view.kind === 'blocked' ? (
      <Status tone="muted">{t('relation.blocked')}</Status>
    ) : view.kind === 'cooldown' ? (
      <Status tone="muted">{t('relation.cooldown', { date: formatDay(view.until) })}</Status>
    ) : view.kind === 'unavailable' ? (
      <Status tone="muted">{t('relation.unavailable')}</Status>
    ) : null;

  if (status === null && !canSend) return null;
  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
      {status}
      {view.kind === 'send' && canSend && (
        <Button
          className="sm:ml-auto"
          onClick={() => {
            setOpen(true);
          }}
        >
          {t('send.open')}
        </Button>
      )}
      {open && (
        <SendRequestDialog
          buyerId={buyerId}
          buyerName={buyerName}
          onClose={() => {
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
