'use client';
// Onay penceresi (F2.13b; US-022 AC1, US-023 AC2–AC5): kabul, red, engel, engel kaldırma, geri
// çekme. UX kararları:
// - Başlıkta eylem + toptancı/perakendeci ünvanı; altında ne olacağını söyleyen kısa madde listesi
//   (kabulde veri paylaşım uyarısı, engelde bekleyen isteğin reddi ve aktif bağlantının bitişi).
// - Tek ana eylem; yıkıcı eylemlerde (red, engel, geri çekme) gül rengi düğme, pencere `alertdialog`.
// - Odak açılışta "Bağla"da (yanlışlıkla Enter ile onay yok); Esc kapatır.
// - Pencere açılınca tek `Idempotency-Key`; hata pencerede `role="alert"`; başarıda pencere kapanır
//   ve listeler sunucudan yenilenir.
import { createIdempotencyKey, respondFailure } from '@b2b/shared';
import { useTranslations } from 'next-intl';
import { useId, useRef } from 'react';
import { ApiError } from '../admin-sellers/api';
import { Dialog } from '../ui/dialog';
import { Button } from '../ui/primitives';
import { type ConfirmAction, useConfirmAction } from './api';
import { useConnectionContext } from './context';

const DESTRUCTIVE: ReadonlySet<ConfirmAction> = new Set(['reject', 'block', 'withdraw']);

/** Eylem başına penceredeki madde sayısı (`connections.confirm.<eylem>.point_<n>`). */
const POINTS: Readonly<Record<ConfirmAction, number>> = {
  accept: 3,
  reject: 2,
  block: 3,
  unblock: 1,
  withdraw: 1,
};

export function ConfirmDialog({
  action,
  targetId,
  name,
  onClose,
  onDone,
}: {
  action: ConfirmAction;
  /** İstek kimliği (kabul/red/geri çekme) veya toptancı kimliği (engel/kaldırma). */
  targetId: string;
  name: string;
  onClose: () => void;
  onDone?: () => void;
}) {
  const t = useTranslations('connections.confirm');
  const tAll = useTranslations();
  const { shell } = useConnectionContext();
  const run = useConfirmAction(shell.activeBusinessId);
  const key = useRef(createIdempotencyKey('resp'));
  const titleId = useId();
  const bodyId = useId();
  const destructive = DESTRUCTIVE.has(action);
  const failure =
    run.error === null
      ? undefined
      : respondFailure(run.error instanceof ApiError ? { code: run.error.code } : undefined);

  function confirm() {
    if (run.isPending) return;
    run.mutate(
      { action, id: targetId, key: key.current },
      {
        onSuccess: () => {
          onDone?.();
          onClose();
        },
      },
    );
  }

  return (
    <Dialog
      labelledBy={titleId}
      describedBy={bodyId}
      onClose={onClose}
      tone={destructive ? 'danger' : 'default'}
    >
      <div className="space-y-6">
        <div className="space-y-2">
          <p
            className={`text-xs font-semibold tracking-wider uppercase ${
              destructive ? 'text-rose-600' : 'text-indigo-600'
            }`}
          >
            {t(`${action}.eyebrow`)}
          </p>
          <h2 id={titleId} className="text-lg font-semibold break-words text-slate-900">
            {t(`${action}.title`, { name })}
          </h2>
        </div>
        <ul
          id={bodyId}
          className={`space-y-2.5 rounded-2xl border p-4 text-sm ${
            action === 'accept'
              ? 'border-amber-200/80 bg-amber-50/60 text-amber-900'
              : 'border-slate-200/80 bg-slate-50/70 text-slate-600'
          }`}
        >
          {Array.from({ length: POINTS[action] }, (_, index) => (
            <li key={index} className="flex gap-2.5">
              <span
                aria-hidden="true"
                className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                  action === 'accept' ? 'bg-amber-500' : 'bg-slate-400'
                }`}
              />
              <span>{t(`${action}.point_${String(index + 1)}`, { name })}</span>
            </li>
          ))}
        </ul>
        {failure !== undefined && (
          <p
            role="alert"
            className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 text-sm text-rose-700"
          >
            {tAll(failure.key)}
          </p>
        )}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" data-autofocus onClick={onClose}>
            {t('cancel')}
          </Button>
          {failure?.refresh !== true && (
            <Button
              variant={destructive ? 'danger' : 'primary'}
              onClick={confirm}
              disabled={run.isPending}
            >
              {run.isPending ? t('working') : t(`${action}.submit`)}
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
