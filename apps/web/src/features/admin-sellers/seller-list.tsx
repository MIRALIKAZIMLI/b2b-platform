'use client';
// Toptancı listesi (F2.1b, US-009): ünvan, VÖEN, durum, aktivasyon; sayfalama (imleç).
// "Yeniden gönder" yalnız `pending`/`expired` satırlarda (US-009 AC3).
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';
import { errorCodeOf } from '../../lib/error-code';
import { type AdminSeller, useResendActivation, useSellers } from './api';

type ResendNote =
  | { readonly kind: 'sent' }
  | { readonly kind: 'not_sent' }
  | { readonly kind: 'error'; readonly code: string };

export function SellerList() {
  const t = useTranslations('adminSellers');
  const tErrors = useTranslations('errors');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const sellers = useSellers();
  const resend = useResendActivation();
  const [notes, setNotes] = useState<Readonly<Record<string, ResendNote>>>({});

  const rows: AdminSeller[] = sellers.data?.pages.flatMap((page) => page.items) ?? [];

  function onResend(id: string) {
    resend.mutate(id, {
      onSuccess: (result) => {
        setNotes((prev) => ({
          ...prev,
          [id]: { kind: result.activationSmsSent ? 'sent' : 'not_sent' },
        }));
      },
      onError: (failure) => {
        setNotes((prev) => ({ ...prev, [id]: { kind: 'error', code: errorCodeOf(failure) } }));
      },
    });
  }

  function noteText(note: ResendNote): string {
    if (note.kind === 'sent') return t('resend_done');
    if (note.kind === 'not_sent') return t('sms_not_sent');
    return tErrors(note.code);
  }

  return (
    <>
      <h1>{t('title')}</h1>
      <p>
        <Link href={`/${locale}/admin/sellers/new`}>{t('new')}</Link>
      </p>
      {sellers.isPending && <p role="status">{tCommon('loading')}</p>}
      {sellers.isError && <p role="alert">{tErrors(errorCodeOf(sellers.error))}</p>}
      {sellers.isSuccess && rows.length === 0 && <p>{t('empty')}</p>}
      {rows.length > 0 && (
        <table>
          <thead>
            <tr>
              <th scope="col">{t('column.legal_name')}</th>
              <th scope="col">{t('column.voen')}</th>
              <th scope="col">{t('column.status')}</th>
              <th scope="col">{t('column.activation')}</th>
              <th scope="col">{t('column.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((seller) => {
              const note = notes[seller.id];
              return (
                <tr key={seller.id} data-seller-id={seller.id}>
                  <td>{seller.legalName}</td>
                  <td>{seller.voen ?? ''}</td>
                  <td data-status={seller.status}>{t(`status.${seller.status}`)}</td>
                  <td data-activation={seller.activation}>
                    {t(`activation.${seller.activation}`)}
                  </td>
                  <td>
                    {seller.activation !== 'accepted' && (
                      <button
                        type="button"
                        disabled={resend.isPending && resend.variables === seller.id}
                        onClick={() => {
                          onResend(seller.id);
                        }}
                      >
                        {t('resend')}
                      </button>
                    )}
                    {note !== undefined && (
                      <span role={note.kind === 'sent' ? 'status' : 'alert'}>{noteText(note)}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {sellers.hasNextPage && (
        <button
          type="button"
          disabled={sellers.isFetchingNextPage}
          onClick={() => {
            void sellers.fetchNextPage();
          }}
        >
          {t('load_more')}
        </button>
      )}
    </>
  );
}
