'use client';
// Bağlantı koşulları penceresi (F2.14b; US-024 AC2–AC3). UX kararları:
// - Başlıkta perakendecinin ünvanı; üç alan: kredi limiti (AZN, isteğe bağlı, boş = limitsiz),
//   ödeme vadesi (0–180 gün, zorunlu), temsilci (seçim; "Təyin edilməyib"). Tek ana eylem "Yadda saxla".
// - Koşul atanmamışsa alanlar öneriyle dolar ve üstte indigo bilgi şeridi kaynağı söyler (önceki
//   dönem / sorğudakı vade); kullanıcı değiştirip kaydeder. Öneri kendiliğinden yazılmaz.
// - Fiyat listesi alanı yok (F3.6); altta tek satırlık bilgi notu varsayılan listenin geçerli olduğunu söyler.
// - Hata pencerede `role="alert"`; alan hataları alanın altında. Başarıda pencere kapanır, liste yenilenir.
import {
  CONNECTION_REQUEST_TERM_MAX_DAYS,
  termsFailureKey,
  termsFormValues,
  termsUpdateBody,
} from '@b2b/shared';
import { useTranslations } from 'next-intl';
import { type SyntheticEvent, useId, useState } from 'react';
import { ApiError } from '../admin-sellers/api';
import { useConnectionContext } from '../connection-requests/context';
import { Dialog } from '../ui/dialog';
import { Button, Field, SelectInput, TextInput } from '../ui/primitives';
import { type ConnectionItem, useSalesReps, useUpdateTerms } from './api';

export function TermsDialog({
  connection,
  onClose,
}: {
  connection: ConnectionItem;
  onClose: () => void;
}) {
  const t = useTranslations('customers');
  const tAll = useTranslations();
  const { shell } = useConnectionContext();
  const reps = useSalesReps(shell.activeBusinessId);
  const update = useUpdateTerms(shell.activeBusinessId);
  const titleId = useId();
  const initial = termsFormValues(connection);
  const [creditLimit, setCreditLimit] = useState(initial.creditLimit);
  const [days, setDays] = useState(initial.paymentTermDays);
  const [rep, setRep] = useState(initial.salesRepMembershipId);
  const [invalid, setInvalid] = useState({ creditLimit: false, paymentTermDays: false });
  const name = connection.counterpartyName ?? t('closed_business');
  const repOptions = reps.data?.items ?? [];
  // Önceki temsilci artık listede yoksa (ayrılmış üye) seçim boş başlar; sunucu da reddeder.
  const repValue = rep === '' || repOptions.some((item) => item.membershipId === rep) ? rep : '';

  function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (update.isPending) return;
    const result = termsUpdateBody({
      creditLimit,
      paymentTermDays: days,
      salesRepMembershipId: repValue,
    });
    if (!result.ok) {
      setInvalid({ creditLimit: result.creditLimit, paymentTermDays: result.paymentTermDays });
      return;
    }
    update.mutate(
      { id: connection.id, body: result.body },
      {
        onSuccess: () => {
          onClose();
        },
      },
    );
  }

  const failureKey =
    update.error === null
      ? undefined
      : termsFailureKey(
          update.error instanceof ApiError
            ? { code: update.error.code, details: update.error.details }
            : undefined,
        );

  return (
    <Dialog labelledBy={titleId} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        <div className="space-y-2">
          <p className="text-xs font-semibold tracking-wider text-indigo-600 uppercase">
            {t('terms.title')}
          </p>
          <h2 id={titleId} className="text-lg font-semibold break-words text-slate-900">
            {name}
          </h2>
          <p className="text-sm text-slate-500">{t('terms.description')}</p>
        </div>
        {(initial.source === 'previous_connection' || initial.source === 'request') && (
          <p className="rounded-2xl border border-indigo-200/70 bg-gradient-to-br from-indigo-50 to-violet-50/60 px-4 py-3 text-sm text-indigo-800">
            {t(`terms.suggested_${initial.source}`)}
          </p>
        )}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="terms-credit-limit"
            label={t('terms.credit_limit')}
            hint={t('terms.credit_limit_hint')}
            error={invalid.creditLimit ? t('terms.credit_limit_invalid') : undefined}
          >
            <TextInput
              id="terms-credit-limit"
              data-autofocus
              inputMode="decimal"
              autoComplete="off"
              value={creditLimit}
              invalid={invalid.creditLimit}
              aria-describedby={invalid.creditLimit ? 'terms-credit-limit-error' : undefined}
              placeholder={t('terms.credit_limit_placeholder')}
              onChange={(event) => {
                setCreditLimit(event.target.value);
                setInvalid((prev) => ({ ...prev, creditLimit: false }));
              }}
            />
          </Field>
          <Field
            id="terms-days"
            label={t('terms.payment_term')}
            hint={t('terms.payment_term_hint', { max: CONNECTION_REQUEST_TERM_MAX_DAYS })}
            error={
              invalid.paymentTermDays
                ? t('terms.payment_term_invalid', { max: CONNECTION_REQUEST_TERM_MAX_DAYS })
                : undefined
            }
          >
            <TextInput
              id="terms-days"
              inputMode="numeric"
              autoComplete="off"
              value={days}
              invalid={invalid.paymentTermDays}
              aria-describedby={invalid.paymentTermDays ? 'terms-days-error' : undefined}
              onChange={(event) => {
                setDays(event.target.value);
                setInvalid((prev) => ({ ...prev, paymentTermDays: false }));
              }}
            />
          </Field>
        </div>
        <Field
          id="terms-rep"
          label={t('terms.sales_rep')}
          hint={reps.isError ? t('terms.sales_rep_unavailable') : t('terms.sales_rep_hint')}
        >
          <SelectInput
            id="terms-rep"
            value={repValue}
            disabled={reps.data === undefined}
            onChange={(event) => {
              setRep(event.target.value);
            }}
          >
            <option value="">{t('terms.sales_rep_none')}</option>
            {repOptions.map((item) => (
              <option key={item.membershipId} value={item.membershipId}>
                {item.fullName}
              </option>
            ))}
          </SelectInput>
        </Field>
        <p className="text-xs text-slate-500">{t('terms.price_list_note')}</p>
        {failureKey !== undefined && (
          <p
            role="alert"
            className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 text-sm text-rose-700"
          >
            {tAll(failureKey)}
          </p>
        )}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>
            {t('terms.cancel')}
          </Button>
          <Button type="submit" disabled={update.isPending}>
            {update.isPending ? t('terms.saving') : t('terms.save')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
