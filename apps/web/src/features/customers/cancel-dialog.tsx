'use client';
// Bağlantı iptali penceresi (F2.15b; US-025 AC1, SF-07) — toptancı müşteriler ve perakendeci
// toptancılarım ekranlarında ortak. UX kararları:
// - `alertdialog` tonunda: gül rengi üst satır "Əlaqəni ləğv et", başlıkta karşı tarafın ünvanı;
//   altında ne olacağını söyleyen 3 madde (yeniden bağlanma yalnız yeni istekle; perakendeci
//   iptalinde 30 günlük bekleme; karşı tarafa bildirim gider, gerekçe görünmez).
// - Gerekçe dört radyo kartı (zorunlu), not isteğe bağlı (≤500, sayaç). İkinci onay ayrı onay
//   kutusu: işaretlenmeden "Ləğv et" kapalı. Odak açılışta "Bağla"da (yanlışlıkla Enter yok).
// - Pencere açılınca tek `Idempotency-Key`; hata pencerede; bağlantı artık aktif değilse (409/404)
//   ana düğme kalkar, liste yenilenir. Başarıda pencere kapanır.
import {
  CONNECTION_CANCEL_NOTE_MAX,
  CONNECTION_CANCEL_REASONS,
  type CancelFormState,
  cancelBody,
  cancelFailure,
  createIdempotencyKey,
  EMPTY_CANCEL_FORM,
} from '@b2b/shared';
import { useTranslations } from 'next-intl';
import { type SyntheticEvent, useId, useRef, useState } from 'react';
import { ApiError } from '../admin-sellers/api';
import { useConnectionContext } from '../connection-requests/context';
import { Dialog } from '../ui/dialog';
import { Button } from '../ui/primitives';
import { useCancelConnection } from './api';

export function CancelDialog({
  connectionId,
  name,
  side,
  onClose,
}: {
  connectionId: string;
  name: string;
  /** İptal edenin tarafı: madde metni (bekleme süresi yalnız perakendecide). */
  side: 'seller' | 'buyer';
  onClose: () => void;
}) {
  const t = useTranslations('connections.cancel');
  const tAll = useTranslations();
  const { shell } = useConnectionContext();
  const run = useCancelConnection(shell.activeBusinessId);
  const key = useRef(createIdempotencyKey('cancel'));
  const titleId = useId();
  const bodyId = useId();
  const [form, setForm] = useState<CancelFormState>(EMPTY_CANCEL_FORM);
  const body = cancelBody(form);
  const failure =
    run.error === null
      ? undefined
      : cancelFailure(run.error instanceof ApiError ? { code: run.error.code } : undefined);

  function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (run.isPending || body === undefined) return;
    run.mutate(
      { id: connectionId, body, key: key.current },
      {
        onSuccess: () => {
          onClose();
        },
      },
    );
  }

  return (
    <Dialog labelledBy={titleId} describedBy={bodyId} onClose={onClose} tone="danger">
      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        <div className="space-y-2">
          <p className="text-xs font-semibold tracking-wider text-rose-600 uppercase">
            {t('eyebrow')}
          </p>
          <h2 id={titleId} className="text-lg font-semibold break-words text-slate-900">
            {t('title', { name })}
          </h2>
        </div>
        <ul
          id={bodyId}
          className="space-y-2.5 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 text-sm text-slate-600"
        >
          {(
            ['point_1', side === 'buyer' ? 'point_2_buyer' : 'point_2_seller', 'point_3'] as const
          ).map((point) => (
            <li key={point} className="flex gap-2.5">
              <span
                aria-hidden="true"
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400"
              />
              <span>{t(point, { name })}</span>
            </li>
          ))}
        </ul>
        <fieldset className="space-y-3">
          <legend className="mb-3 text-sm font-semibold text-slate-900">{t('reason_label')}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {CONNECTION_CANCEL_REASONS.map((reason) => {
              const selected = form.reason === reason;
              return (
                <label
                  key={reason}
                  className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition-all duration-200 focus-within:ring-2 focus-within:ring-rose-500/30 ${
                    selected
                      ? 'border-rose-300 bg-rose-50/70 font-semibold text-rose-800 shadow-sm'
                      : 'border-slate-200/80 bg-white text-slate-700 hover:border-slate-300 hover:shadow-sm'
                  }`}
                >
                  <input
                    type="radio"
                    name="cancel-reason"
                    value={reason}
                    checked={selected}
                    className="h-4 w-4 accent-rose-600"
                    onChange={() => {
                      setForm((prev) => ({ ...prev, reason }));
                    }}
                  />
                  {t(`reason.${reason}`)}
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="space-y-2">
          <label htmlFor="cancel-note" className="text-sm font-semibold text-slate-900">
            {t('note_label')}
          </label>
          <textarea
            id="cancel-note"
            rows={3}
            maxLength={CONNECTION_CANCEL_NOTE_MAX}
            value={form.note}
            placeholder={t('note_placeholder')}
            onChange={(event) => {
              setForm((prev) => ({ ...prev, note: event.target.value }));
            }}
            className="block w-full resize-none rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition-all duration-200 placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
          />
          <p className="text-right text-xs text-slate-400 tabular-nums">
            {t('note_counter', { count: form.note.length, max: CONNECTION_CANCEL_NOTE_MAX })}
          </p>
          <p className="text-xs text-slate-500">{t('note_hint')}</p>
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-rose-200/80 bg-rose-50/50 p-4 text-sm text-rose-900">
          <input
            type="checkbox"
            checked={form.confirmed}
            className="mt-0.5 h-4 w-4 shrink-0 accent-rose-600"
            onChange={(event) => {
              setForm((prev) => ({ ...prev, confirmed: event.target.checked }));
            }}
          />
          <span>{t('confirm_label', { name })}</span>
        </label>
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
            {t('close')}
          </Button>
          {failure?.refresh !== true && (
            <Button type="submit" variant="danger" disabled={run.isPending || body === undefined}>
              {run.isPending ? t('working') : t('submit')}
            </Button>
          )}
        </div>
      </form>
    </Dialog>
  );
}
