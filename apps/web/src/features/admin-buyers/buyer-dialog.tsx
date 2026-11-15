'use client';
// Perakendeci kayıt penceresi (F2.18b; US-015 AC1–AC2, US-016 AC1–AC3). Üç görünüm:
// - `detail`: ünvan, VÖEN (+ e-taxes.gov.az'da elle kontrol bağlantısı), hukuki tip, bölge, durum,
//   doğrulama ve kayıt tarihi, profil doluluğu; altında yazma rolüne göre eylemler.
// - `reject`: gerekçe kodu (radyo kartları, zorunlu) + yalnız audit'e giden not (isteğe bağlı).
// - `status`: askıya al / kaldır / sil ikinci adımı: gerekçe (3–500, zorunlu, yalnız audit) ve onay
//   kutusu; işaretlenmeden ana düğme kapalı. "Sil" ne olacağını (geçmiş varsa arşiv, yoksa kalıcı
//   silme) önceden söyler.
import {
  ADMIN_NOTE_MAX,
  type BusinessStatusAction,
  E_TAXES_VOEN_LOOKUP_URL,
  VOEN_REJECT_REASONS,
} from '@b2b/shared';
import { useTranslations } from 'next-intl';
import { type ReactNode, type SyntheticEvent, useId, useState } from 'react';
import { errorCodeOf } from '../../lib/error-code';
import { useShell } from '../shell/use-shell';
import { Dialog } from '../ui/dialog';
import { Badge, Button } from '../ui/primitives';
import { type AdminBuyer, useBuyer, useStatusAction, useVoenDecision } from './api';
import { VoenBadge } from './voen-badge';
import {
  buyerActions,
  EMPTY_REJECT_FORM,
  EMPTY_STATUS_FORM,
  noteProblem,
  outcomeKey,
  type RejectForm,
  rejectBody,
  type StatusForm,
  statusBody,
} from './model';
import { useFormatDay } from './use-format';

type View =
  { kind: 'detail' } | { kind: 'reject' } | { kind: 'status'; action: BusinessStatusAction };

export function BuyerDialog({
  id,
  regionName,
  onClose,
  onFinished,
}: {
  id: string;
  regionName: (regionId: string) => string;
  onClose: () => void;
  /** Durum işlemi bitti: pencere kapanır, liste üstünde sonuç metni. */
  onFinished: (text: string) => void;
}) {
  const t = useTranslations('adminBuyers');
  const tErrors = useTranslations('errors');
  const titleId = useId();
  const buyer = useBuyer(id);
  const [view, setView] = useState<View>({ kind: 'detail' });

  return (
    <Dialog
      labelledBy={titleId}
      onClose={onClose}
      tone={view.kind === 'status' && view.action !== 'unsuspend' ? 'danger' : 'default'}
    >
      {buyer.data === undefined ? (
        buyer.isError ? (
          <div className="space-y-6">
            <h2 id={titleId} className="text-lg font-semibold text-slate-900">
              {t('dialog.title')}
            </h2>
            <p role="alert" className="text-sm text-rose-700">
              {tErrors(errorCodeOf(buyer.error))}
            </p>
            <div className="flex justify-end">
              <Button variant="secondary" data-autofocus onClick={onClose}>
                {t('dialog.close')}
              </Button>
            </div>
          </div>
        ) : (
          <p id={titleId} role="status" className="text-sm text-slate-500">
            {t('loading')}
          </p>
        )
      ) : view.kind === 'detail' ? (
        <Detail
          buyer={buyer.data}
          titleId={titleId}
          region={regionName(buyer.data.regionId)}
          onClose={onClose}
          onView={setView}
        />
      ) : view.kind === 'reject' ? (
        <RejectStep
          buyer={buyer.data}
          titleId={titleId}
          onBack={() => {
            setView({ kind: 'detail' });
          }}
        />
      ) : (
        <StatusStep
          buyer={buyer.data}
          action={view.action}
          titleId={titleId}
          onBack={() => {
            setView({ kind: 'detail' });
          }}
          onFinished={onFinished}
        />
      )}
    </Dialog>
  );
}

function Header({
  titleId,
  eyebrow,
  title,
  danger = false,
  children,
}: {
  titleId: string;
  eyebrow: string;
  title: string;
  danger?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <p
        className={`text-xs font-semibold tracking-wider uppercase ${danger ? 'text-rose-600' : 'text-indigo-600'}`}
      >
        {eyebrow}
      </p>
      <h2 id={titleId} className="text-lg font-semibold break-words text-slate-900">
        {title}
      </h2>
      {children}
    </div>
  );
}

function Detail({
  buyer,
  titleId,
  region,
  onClose,
  onView,
}: {
  buyer: AdminBuyer;
  titleId: string;
  region: string;
  onClose: () => void;
  onView: (view: View) => void;
}) {
  const t = useTranslations('adminBuyers');
  const tErrors = useTranslations('errors');
  const formatDay = useFormatDay();
  const role = useShell().me?.platformRole ?? null;
  const actions = buyerActions(buyer, role);
  const decide = useVoenDecision(buyer.id);
  const writable = actions.status.length > 0;
  const rows: [string, ReactNode][] = [
    [
      t('field.voen'),
      buyer.voen === null ? (
        <span className="text-slate-400">{t('field.none')}</span>
      ) : (
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-mono tracking-wide">{buyer.voen}</span>
          <a
            href={E_TAXES_VOEN_LOOKUP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-indigo-600 underline-offset-4 transition-colors hover:text-indigo-700 hover:underline"
          >
            {t('field.e_taxes')} ↗
          </a>
        </span>
      ),
    ],
    [
      t('field.legal_type'),
      buyer.legalType === null ? (
        <span className="text-slate-400">{t('field.none')}</span>
      ) : (
        t(`legal_type.${buyer.legalType}`)
      ),
    ],
    [t('field.region'), region === '' ? <span className="text-slate-400">—</span> : region],
    [t('field.status'), t(`status.${buyer.status}`)],
    [
      t('field.verified_at'),
      buyer.verifiedAt === null ? (
        <span className="text-slate-400">{t('field.not_verified')}</span>
      ) : (
        formatDay(buyer.verifiedAt)
      ),
    ],
    [t('field.created_at'), formatDay(buyer.createdAt)],
    [t('field.completeness'), `${String(buyer.profileCompleteness)}%`],
  ];

  return (
    <div className="space-y-6" data-testid="buyer-dialog">
      <Header titleId={titleId} eyebrow={t('dialog.eyebrow')} title={buyer.legalName}>
        <div className="flex flex-wrap gap-2">
          <VoenBadge buyer={buyer} />
          {buyer.status !== 'active' && <Badge tone="slate">{t(`status.${buyer.status}`)}</Badge>}
        </div>
      </Header>
      <dl className="divide-y divide-slate-100 rounded-2xl border border-slate-200/80 bg-slate-50/50 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-3 gap-4 px-4 py-3">
            <dt className="text-slate-500">{label}</dt>
            <dd className="col-span-2 font-medium text-slate-900 tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      {(actions.verify || actions.reject) && (
        <section className="space-y-3 rounded-2xl border border-amber-200/80 bg-amber-50/40 p-4">
          <h3 className="text-sm font-semibold text-slate-900">{t('voen.title')}</h3>
          <p className="text-sm text-slate-600">{t('voen.hint')}</p>
          {decide.isError && (
            <p role="alert" className="text-sm text-rose-700">
              {tErrors(errorCodeOf(decide.error))}
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              disabled={decide.isPending}
              onClick={() => {
                decide.mutate({ decision: 'verify' });
              }}
            >
              {decide.isPending ? t('working') : t('voen.verify')}
            </Button>
            <Button
              variant="secondary"
              disabled={decide.isPending}
              onClick={() => {
                onView({ kind: 'reject' });
              }}
            >
              {t('voen.reject')}
            </Button>
          </div>
        </section>
      )}
      {decide.isSuccess && (
        <p role="status" className="text-sm font-medium text-emerald-600">
          ✓ {t('voen.verified_done')}
        </p>
      )}

      {writable ? (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">{t('manage.title')}</h3>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {actions.status.map((action) => (
              <Button
                key={action}
                variant={action === 'archive' ? 'quiet-danger' : 'secondary'}
                onClick={() => {
                  onView({ kind: 'status', action });
                }}
              >
                {t(`action.${action}.open`)}
              </Button>
            ))}
          </div>
        </section>
      ) : (
        <p className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 text-sm text-slate-600">
          {t('read_only')}
        </p>
      )}

      <div className="flex justify-end">
        <Button variant="secondary" data-autofocus onClick={onClose}>
          {t('dialog.close')}
        </Button>
      </div>
    </div>
  );
}

function RejectStep({
  buyer,
  titleId,
  onBack,
}: {
  buyer: AdminBuyer;
  titleId: string;
  onBack: () => void;
}) {
  const t = useTranslations('adminBuyers');
  const tErrors = useTranslations('errors');
  const decide = useVoenDecision(buyer.id);
  const [form, setForm] = useState<RejectForm>(EMPTY_REJECT_FORM);
  const body = rejectBody(form);
  const noteId = useId();

  function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (decide.isPending || body === undefined) return;
    decide.mutate(body, { onSuccess: onBack });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate data-testid="reject-form">
      <Header titleId={titleId} eyebrow={t('reject.eyebrow')} title={buyer.legalName} danger>
        <p className="text-sm text-slate-600">{t('reject.hint')}</p>
      </Header>
      <fieldset className="space-y-3">
        <legend className="mb-3 text-sm font-semibold text-slate-900">{t('reject.reason')}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {VOEN_REJECT_REASONS.map((reason) => {
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
                  name="reject-reason"
                  value={reason}
                  checked={selected}
                  className="h-4 w-4 accent-rose-600"
                  onChange={() => {
                    setForm((prev) => ({ ...prev, reason }));
                  }}
                />
                {t(`reject.reasons.${reason}`)}
              </label>
            );
          })}
        </div>
      </fieldset>
      <NoteField
        id={noteId}
        label={t('reject.note')}
        hint={t('reject.note_hint')}
        value={form.note}
        optional
        onChange={(note) => {
          setForm((prev) => ({ ...prev, note }));
        }}
      />
      {decide.isError && (
        <p
          role="alert"
          className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 text-sm text-rose-700"
        >
          {tErrors(errorCodeOf(decide.error))}
        </p>
      )}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="secondary" data-autofocus onClick={onBack}>
          {t('back')}
        </Button>
        <Button type="submit" variant="danger" disabled={decide.isPending || body === undefined}>
          {decide.isPending ? t('working') : t('reject.submit')}
        </Button>
      </div>
    </form>
  );
}

function StatusStep({
  buyer,
  action,
  titleId,
  onBack,
  onFinished,
}: {
  buyer: AdminBuyer;
  action: BusinessStatusAction;
  titleId: string;
  onBack: () => void;
  onFinished: (text: string) => void;
}) {
  const t = useTranslations('adminBuyers');
  const tErrors = useTranslations('errors');
  const run = useStatusAction(buyer.id);
  const [form, setForm] = useState<StatusForm>(EMPTY_STATUS_FORM);
  const body = statusBody(action, form);
  const noteId = useId();
  const danger = action !== 'unsuspend';

  function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (run.isPending || body === undefined) return;
    run.mutate(body, {
      onSuccess: (result) => {
        onFinished(t(`done.${outcomeKey(action, result.outcome)}`, { name: buyer.legalName }));
      },
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate data-testid="status-form">
      <Header
        titleId={titleId}
        eyebrow={t(`action.${action}.eyebrow`)}
        title={buyer.legalName}
        danger={danger}
      />
      <ul className="space-y-2.5 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 text-sm text-slate-600">
        {(['point_1', 'point_2'] as const).map((point) => (
          <li key={point} className="flex gap-2.5">
            <span
              aria-hidden="true"
              className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400"
            />
            <span>{t(`action.${action}.${point}`)}</span>
          </li>
        ))}
      </ul>
      <NoteField
        id={noteId}
        label={t('reason')}
        hint={t('reason_hint')}
        value={form.reason}
        onChange={(reason) => {
          setForm((prev) => ({ ...prev, reason }));
        }}
      />
      <label
        className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-sm ${
          danger
            ? 'border-rose-200/80 bg-rose-50/50 text-rose-900'
            : 'border-slate-200/80 bg-slate-50/50 text-slate-800'
        }`}
      >
        <input
          type="checkbox"
          checked={form.confirmed}
          className={`mt-0.5 h-4 w-4 shrink-0 ${danger ? 'accent-rose-600' : 'accent-indigo-600'}`}
          onChange={(event) => {
            setForm((prev) => ({ ...prev, confirmed: event.target.checked }));
          }}
        />
        <span>{t(`action.${action}.confirm`, { name: buyer.legalName })}</span>
      </label>
      {run.isError && (
        <p
          role="alert"
          className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 text-sm text-rose-700"
        >
          {tErrors(errorCodeOf(run.error))}
        </p>
      )}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="secondary" data-autofocus onClick={onBack}>
          {t('back')}
        </Button>
        <Button
          type="submit"
          variant={danger ? 'danger' : 'primary'}
          disabled={run.isPending || body === undefined}
        >
          {run.isPending ? t('working') : t(`action.${action}.submit`)}
        </Button>
      </div>
    </form>
  );
}

function NoteField({
  id,
  label,
  hint,
  value,
  optional = false,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  optional?: boolean;
  onChange: (value: string) => void;
}) {
  const t = useTranslations('adminBuyers');
  const problem = value.trim() === '' ? undefined : noteProblem(value);
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-semibold text-slate-900">
        {label}
        {optional && <span className="ml-1 font-normal text-slate-400">{t('optional')}</span>}
      </label>
      <textarea
        id={id}
        name="reason"
        rows={3}
        maxLength={ADMIN_NOTE_MAX}
        value={value}
        aria-invalid={problem !== undefined}
        aria-describedby={`${id}-hint`}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        className="block w-full resize-none rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition-all duration-200 placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
      />
      <div id={`${id}-hint`} className="flex justify-between gap-4 text-xs">
        <span className={problem === undefined ? 'text-slate-500' : 'text-rose-600'}>
          {problem === undefined ? hint : t(`note_error.${problem}`)}
        </span>
        <span className="shrink-0 text-slate-400 tabular-nums">
          {value.length}/{ADMIN_NOTE_MAX}
        </span>
      </div>
    </div>
  );
}
