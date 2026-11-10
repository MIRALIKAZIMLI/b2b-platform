'use client';
// Bağlantı isteği penceresi (F2.12b; US-021). UX kararları:
// - Tek odak: perakendecinin ünvanı başlıkta, iki isteğe bağlı alan (mesaj ≤500 sayaçlı, vade
//   0–180 gün), tek ana eylem "Sorğunu göndər". Esc / arka plan / "Bağla" kapatır.
// - `Idempotency-Key` pencere açılınca bir kez üretilir; hata sonrası yeniden denemede aynı kalır.
// - Pencere `document.body`'ye portal ile çizilir; açılınca mesaj alanına odaklanır.
// - Hata pencerede, alanların altında `role="alert"` ile: 409 dört kod (bekleme süresinde bitiş
//   tarihi), 429 kalan saat/dakika, 403 salt-okunur abonelik, 404 artık istek alamıyor.
// - Başarıda pencere başarı durumuna geçer ("Sorğulara bax" bağlantısı); kart arkada "Gözləyir"e
//   döner (dizin sorgusu yenilenir).
import {
  CONNECTION_REQUEST_MESSAGE_MAX,
  CONNECTION_REQUEST_TERM_MAX_DAYS,
  connectionFailureMessage,
  connectionRequestFailure,
  createIdempotencyKey,
  parseTermDays,
} from '@b2b/shared';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type SyntheticEvent, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ApiError } from '../admin-sellers/api';
import { Button, Field, TextArea, TextInput } from '../ui/primitives';
import { useSendConnectionRequest } from './api';
import { useConnectionContext, useFailureText } from './context';

export function SendRequestDialog({
  buyerId,
  buyerName,
  onClose,
}: {
  buyerId: string;
  buyerName: string;
  onClose: () => void;
}) {
  const t = useTranslations('connections');
  const failureText = useFailureText();
  const { shell, locale } = useConnectionContext();
  const send = useSendConnectionRequest(shell.activeBusinessId);
  const key = useRef(createIdempotencyKey('conn'));
  const titleId = useId();
  const [message, setMessage] = useState('');
  const [term, setTerm] = useState('');
  const [termInvalid, setTermInvalid] = useState(false);

  useEffect(() => {
    document.getElementById('connection-message')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const days = parseTermDays(term);
    setTermInvalid(days === 'invalid');
    if (days === 'invalid' || send.isPending) return;
    const trimmed = message.trim();
    send.mutate({
      key: key.current,
      body: {
        buyerId,
        ...(trimmed === '' ? {} : { message: trimmed }),
        ...(days === undefined ? {} : { proposedPaymentTermDays: days }),
      },
    });
  }

  const failure =
    send.error === null
      ? undefined
      : connectionRequestFailure(
          send.error instanceof ApiError
            ? { code: send.error.code, details: send.error.details }
            : undefined,
        );

  // Portal: kartın `backdrop-blur`u sabit konumlu çocuklar için kapsayıcı olur; pencere gövdede.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-lg rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xl sm:p-8"
      >
        {send.isSuccess ? (
          <div className="space-y-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-600/20">
              <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor">
                <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z" />
              </svg>
            </div>
            <div className="space-y-2">
              <h2 id={titleId} className="text-lg font-semibold text-slate-900">
                {t('send.success_title')}
              </h2>
              <p className="text-sm text-slate-500">
                {t('send.success_body', { name: buyerName })}
              </p>
            </div>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={onClose}>
                {t('send.close')}
              </Button>
              <Link
                href={`/${locale}/seller/requests`}
                className="inline-flex items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-500/20 transition-all duration-200 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none"
              >
                {t('send.go_requests')}
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-6" noValidate>
            <div className="space-y-2">
              <p className="text-xs font-semibold tracking-wider text-indigo-600 uppercase">
                {t('send.title')}
              </p>
              <h2 id={titleId} className="text-lg font-semibold break-words text-slate-900">
                {buyerName}
              </h2>
              <p className="text-sm text-slate-500">{t('send.description', { name: buyerName })}</p>
            </div>
            <Field
              id="connection-message"
              label={t('send.message')}
              hint={t('send.message_count', {
                count: message.length,
                max: CONNECTION_REQUEST_MESSAGE_MAX,
              })}
            >
              <TextArea
                id="connection-message"
                rows={4}
                maxLength={CONNECTION_REQUEST_MESSAGE_MAX}
                value={message}
                placeholder={t('send.message_placeholder')}
                onChange={(event) => {
                  setMessage(event.target.value);
                }}
              />
            </Field>
            <Field
              id="connection-term"
              label={t('send.term')}
              hint={t('send.term_hint', { max: CONNECTION_REQUEST_TERM_MAX_DAYS })}
              error={
                termInvalid
                  ? t('send.term_invalid', { max: CONNECTION_REQUEST_TERM_MAX_DAYS })
                  : undefined
              }
              className="sm:max-w-[220px]"
            >
              <TextInput
                id="connection-term"
                inputMode="numeric"
                autoComplete="off"
                value={term}
                invalid={termInvalid}
                aria-describedby={termInvalid ? 'connection-term-error' : undefined}
                onChange={(event) => {
                  setTerm(event.target.value);
                  setTermInvalid(false);
                }}
              />
            </Field>
            {failure !== undefined && (
              <p
                role="alert"
                className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 text-sm text-rose-700"
              >
                {failureText(connectionFailureMessage(failure))}
              </p>
            )}
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={onClose}>
                {t('send.close')}
              </Button>
              <Button type="submit" disabled={send.isPending}>
                {send.isPending ? t('send.sending') : t('send.submit')}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
