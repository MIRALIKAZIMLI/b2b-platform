'use client';
// Toptancı başvuruları (F2.2b, US-008 AC1): durum sekmeleri, başvuru kartları, ret ve başvurudan
// toptancı açma. UX kararları: varsayılan sekme "Bekleyen" (moderasyon kuyruğu); her başvuru kendi
// kartında, iletişim bilgisi tek bakışta; ret geri alınamaz, bu yüzden kart içinde ikinci bir onay
// ister; "Toptancı aç" formu başvuruyla doldurur (kişisel veri adrese yazılmaz).
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { errorCodeOf } from '../../lib/error-code';
import { useRegionOptions } from '../admin-sellers/api';
import { Badge, Button, Card, PageHeader } from '../ui/primitives';
import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
  type SellerApplication,
  useApplications,
  useRejectApplication,
} from './api';
import { handOffApplication } from './handoff';
import { NOTE_CLASS } from './note-class';

const STATUS_TONE = { pending: 'amber', approved: 'emerald', rejected: 'slate' } as const;

export function ApplicationList() {
  const t = useTranslations('adminApplications');
  const tErrors = useTranslations('errors');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const [status, setStatus] = useState<ApplicationStatus>('pending');
  const applications = useApplications(status);
  const regions = useRegionOptions(locale);
  const reject = useRejectApplication();
  const [confirming, setConfirming] = useState<string | undefined>();

  const regionLabel = new Map((regions.data ?? []).map((option) => [option.id, option.label]));
  const rows: SellerApplication[] = applications.data?.pages.flatMap((page) => page.items) ?? [];
  const dateFormat = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  function openSeller(application: SellerApplication) {
    handOffApplication({
      id: application.id,
      legalName: application.legalName,
      voen: application.voen,
      regionId: application.regionId,
      contactName: application.contactName,
      phone: application.phone,
    });
    router.push(`/${locale}/admin/sellers/new?application=${application.id}`);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-10 sm:px-6">
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} description={t('description')} />

      <div
        role="tablist"
        aria-label={t('status_filter')}
        className="inline-flex rounded-xl border border-slate-200/80 bg-white/70 p-1 shadow-sm backdrop-blur"
      >
        {APPLICATION_STATUSES.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={status === value}
            onClick={() => {
              setStatus(value);
              setConfirming(undefined);
            }}
            className={
              status === value
                ? 'rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200'
                : 'rounded-lg px-4 py-2 text-sm font-medium text-slate-500 transition-all duration-200 hover:text-slate-900'
            }
          >
            {t(`status.${value}`)}
          </button>
        ))}
      </div>

      {applications.isPending && (
        <p role="status" className="text-sm text-slate-500">
          {tCommon('loading')}
        </p>
      )}
      {applications.isError && (
        <p role="alert" className="text-sm text-rose-600">
          {tErrors(errorCodeOf(applications.error))}
        </p>
      )}
      {reject.isError && (
        <p role="alert" className="text-sm text-rose-600">
          {tErrors(errorCodeOf(reject.error))}
        </p>
      )}

      {applications.isSuccess && rows.length === 0 && (
        <Card className="p-10 text-center">
          <p className="text-sm font-semibold text-slate-900">{t('empty_title')}</p>
          <p className="mt-1 text-sm text-slate-500">{t('empty_body')}</p>
        </Card>
      )}

      <ul className="space-y-4">
        {rows.map((application) => (
          <li key={application.id} data-testid="seller-application-row">
            <Card className="p-6">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="min-w-0 text-base font-semibold [overflow-wrap:anywhere] text-slate-900">
                      {application.legalName}
                    </h2>
                    <Badge tone={STATUS_TONE[application.status]}>
                      {t(`status.${application.status}`)}
                    </Badge>
                  </div>
                  <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
                    <Detail label={t('voen')} value={application.voen} mono />
                    <Detail
                      label={t('region')}
                      value={regionLabel.get(application.regionId) ?? '—'}
                    />
                    <Detail label={t('contact')} value={application.contactName} />
                    <Detail label={t('phone')} value={application.phone} mono />
                    <Detail
                      label={t('created_at')}
                      value={dateFormat.format(new Date(application.createdAt))}
                    />
                  </dl>
                  {application.categoryNote !== null && (
                    <p className={NOTE_CLASS}>{application.categoryNote}</p>
                  )}
                </div>

                {application.status === 'pending' && (
                  <div className="flex shrink-0 flex-col gap-2 sm:w-44">
                    {confirming === application.id ? (
                      <>
                        <p className="text-xs text-slate-500">{t('reject_confirm')}</p>
                        <Button
                          variant="secondary"
                          className="text-rose-700"
                          disabled={reject.isPending}
                          onClick={() => {
                            reject.mutate(application.id, {
                              onSettled: () => {
                                setConfirming(undefined);
                              },
                            });
                          }}
                        >
                          {t('reject_yes')}
                        </Button>
                        <Button
                          variant="quiet-danger"
                          className="text-slate-500 hover:text-slate-900"
                          onClick={() => {
                            setConfirming(undefined);
                          }}
                        >
                          {t('reject_cancel')}
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          onClick={() => {
                            openSeller(application);
                          }}
                        >
                          {t('open_seller')}
                        </Button>
                        <Button
                          variant="quiet-danger"
                          onClick={() => {
                            setConfirming(application.id);
                          }}
                        >
                          {t('reject')}
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ul>

      {applications.hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            disabled={applications.isFetchingNextPage}
            onClick={() => {
              void applications.fetchNextPage();
            }}
          >
            {t('load_more')}
          </Button>
        </div>
      )}
    </div>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd
        className={`min-w-0 [overflow-wrap:anywhere] text-slate-900${mono ? ' font-mono tabular-nums' : ''}`}
      >
        {value}
      </dd>
    </div>
  );
}
