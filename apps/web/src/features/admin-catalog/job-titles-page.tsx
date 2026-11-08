'use client';
// Unvanlar (F2.9b, US-012). UX kararları: başlıkta tek ana eylem "Yeni unvan"; satırda ad, kod,
// yetenek, şablon, durum rozetleri (aktiv/passiv, istifadədə). Satır eylemleri: Düzenle,
// Pasifleştir/Aktivleştir; "Sil" yalnız kullanılmayan unvanda ve onay sonrası (AC3). Kullanımdaki
// unvanda silme yerine açıklama gösterilir.
import { catalogFailure, pickLocalizedText } from '@b2b/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { errorCodeOf } from '../../lib/error-code';
import { ApiError } from '../admin-sellers/api';
import { LoadFailed, StatusLine } from '../seller-settings/status';
import { Badge, Button, Card, PageHeader } from '../ui/primitives';
import { type AdminJobTitle, useJobTitleMutations, useJobTitles, useRoleTemplates } from './api';
import { JobTitleEditor, type JobTitleEditorMode } from './job-title-editor';

export function JobTitlesPage() {
  const t = useTranslations('adminCatalog');
  const tErrors = useTranslations('errors');
  const locale = useLocale();
  const titles = useJobTitles();
  const templates = useRoleTemplates();
  const { update, remove } = useJobTitleMutations();
  const [mode, setMode] = useState<JobTitleEditorMode | undefined>();
  const [saved, setSaved] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [confirming, setConfirming] = useState<string | undefined>();

  const reset = () => {
    setSaved(undefined);
    setError(undefined);
  };
  const onError = (failure: unknown) => {
    const outcome = catalogFailure(failure instanceof ApiError ? failure : undefined);
    setError(outcome.kind === 'catalog' ? t(`failure.${outcome.reason}`) : tErrors(outcome.code));
  };
  const templateName = (id: string | null) => {
    const template = templates.data?.find((item) => item.id === id);
    return template === undefined
      ? '—'
      : (pickLocalizedText(template.name, locale) ?? template.code);
  };

  function setActive(title: AdminJobTitle, isActive: boolean) {
    reset();
    update.mutate(
      { id: title.id, body: { isActive } },
      {
        onSuccess: () => {
          setSaved(isActive ? t('title.activated') : t('title.deactivated'));
        },
        onError,
      },
    );
  }

  function onDelete(title: AdminJobTitle) {
    reset();
    remove.mutate(title.id, {
      onSuccess: () => {
        setConfirming(undefined);
        setSaved(t('title.deleted'));
      },
      onError: (failure) => {
        setConfirming(undefined);
        onError(failure);
      },
    });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6 lg:py-12">
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title.title')}
        description={t('title.description')}
        action={
          mode === undefined ? (
            <Button
              disabled={templates.data === undefined}
              onClick={() => {
                reset();
                setMode({ kind: 'create' });
              }}
            >
              {t('title.create_open')}
            </Button>
          ) : undefined
        }
      />
      {mode !== undefined && templates.data !== undefined && (
        <JobTitleEditor
          key={mode.kind === 'edit' ? mode.title.id : 'create'}
          mode={mode}
          templates={templates.data}
          onDone={(text) => {
            setMode(undefined);
            setSaved(text === '' ? undefined : text);
          }}
        />
      )}
      <StatusLine error={error} saved={saved !== undefined} savedText={saved ?? ''} />
      {titles.isPending && (
        <p role="status" className="text-sm text-slate-500">
          {t('loading')}
        </p>
      )}
      {titles.isError &&
        (errorCodeOf(titles.error) === 'INTERNAL_ERROR' ? (
          <LoadFailed onRetry={() => void titles.refetch()} />
        ) : (
          <p role="alert">{tErrors(errorCodeOf(titles.error))}</p>
        ))}
      {titles.isSuccess && (
        <Card className="overflow-hidden">
          <div className="flex items-center gap-3 border-b border-slate-200/80 px-6 py-4">
            <h2 className="text-base font-semibold text-slate-900">{t('title.list_title')}</h2>
            <span className="text-xs font-medium text-slate-500 tabular-nums">
              {t('count', { count: titles.data.length })}
            </span>
          </div>
          {titles.data.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-slate-500">{t('title.empty')}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {titles.data.map((title) => (
                <li
                  key={title.id}
                  data-testid="job-title-row"
                  data-code={title.code}
                  className="flex flex-col gap-3 px-6 py-4 transition-colors duration-200 hover:bg-slate-50/70 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`truncate text-sm font-medium ${title.isActive ? 'text-slate-900' : 'text-slate-400'}`}
                      >
                        {pickLocalizedText(title.name, locale) ?? title.code}
                      </span>
                      <Badge tone={title.isActive ? 'emerald' : 'slate'}>
                        {title.isActive ? t('title.active') : t('title.inactive')}
                      </Badge>
                      {title.inUse && <Badge tone="amber">{t('title.in_use')}</Badge>}
                    </div>
                    <p className="text-xs text-slate-500">
                      <span className="font-mono">{title.code}</span>
                      <span className="mx-2 text-slate-300">·</span>
                      {t(`capability.${title.capability}`)}
                      <span className="mx-2 text-slate-300">·</span>
                      {templateName(title.roleTemplateId)}
                    </p>
                  </div>
                  {mode === undefined && (
                    <div className="flex flex-wrap items-center gap-2">
                      {confirming === title.id ? (
                        <>
                          <span className="text-xs text-slate-600">
                            {t('title.delete_confirm')}
                          </span>
                          <Button
                            variant="quiet-danger"
                            disabled={remove.isPending}
                            onClick={() => {
                              onDelete(title);
                            }}
                          >
                            {t('title.delete_yes')}
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setConfirming(undefined);
                            }}
                          >
                            {t('cancel')}
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="secondary"
                            onClick={() => {
                              reset();
                              setMode({ kind: 'edit', title });
                            }}
                          >
                            {t('edit')}
                          </Button>
                          <Button
                            variant="secondary"
                            disabled={update.isPending}
                            onClick={() => {
                              setActive(title, !title.isActive);
                            }}
                          >
                            {title.isActive ? t('title.deactivate') : t('title.activate')}
                          </Button>
                          {title.inUse ? (
                            <span className="text-xs text-slate-500">{t('title.in_use_hint')}</span>
                          ) : (
                            <Button
                              variant="quiet-danger"
                              onClick={() => {
                                reset();
                                setConfirming(title.id);
                              }}
                            >
                              {t('title.delete')}
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
