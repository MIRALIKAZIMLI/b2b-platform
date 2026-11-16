'use client';
// Faaliyet alanları (F3.2b, US-029 AC1): perakendeci kayıt formundaki liste. UX kararları: tek ana
// eylem "Yeni faaliyet alanı"; sıra numarasına göre liste; satırda ad, diğer diller soluk, rozet.
// Pasif tür kayıt formunda görünmez; onu seçmiş perakendeciler etkilenmez (ipucu). Silme yok.
import { pickLocalizedText } from '@b2b/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { errorCodeOf } from '../../lib/error-code';
import { LoadFailed, StatusLine } from '../seller-settings/status';
import { Badge, Button, Card, PageHeader } from '../ui/primitives';
import { type AdminActivityType, useActivityTypeMutations, useAdminActivityTypes } from './api';
import { EntryEditor } from './entry-editor';
import { useFailureText } from './failure';

type Mode =
  { readonly kind: 'create' } | { readonly kind: 'edit'; readonly item: AdminActivityType };

export function ActivityTypesPage() {
  const t = useTranslations('adminTaxonomy');
  const tCatalog = useTranslations('adminCatalog');
  const tErrors = useTranslations('errors');
  const locale = useLocale();
  const failureText = useFailureText();
  const types = useAdminActivityTypes();
  const { create, update } = useActivityTypeMutations();
  const [mode, setMode] = useState<Mode | undefined>();
  const [saved, setSaved] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  const label = (item: AdminActivityType) => pickLocalizedText(item.name, locale) ?? item.id;
  const items = [...(types.data ?? [])].sort(
    (a, b) => a.sortOrder - b.sortOrder || label(a).localeCompare(label(b)),
  );

  const open = (next: Mode) => {
    setSaved(undefined);
    setError(undefined);
    setMode(next);
  };

  function setActive(item: AdminActivityType, isActive: boolean) {
    setSaved(undefined);
    setError(undefined);
    update.mutate(
      { id: item.id, body: { isActive } },
      {
        onSuccess: () => {
          setSaved(isActive ? t('activated') : t('deactivated'));
        },
        onError: (failure) => {
          setError(failureText(failure));
        },
      },
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6 lg:py-12">
      <PageHeader
        eyebrow={tCatalog('eyebrow')}
        title={t('activity.title')}
        description={t('activity.description')}
        action={
          mode === undefined ? (
            <Button
              disabled={!types.isSuccess}
              onClick={() => {
                open({ kind: 'create' });
              }}
            >
              {t('activity.create_open')}
            </Button>
          ) : undefined
        }
      />
      {mode !== undefined && (
        <EntryEditor
          key={mode.kind === 'edit' ? mode.item.id : 'create'}
          testId="activity-type-form"
          title={mode.kind === 'edit' ? t('activity.edit_title') : t('activity.create_title')}
          hint={t('activity.editor_hint')}
          initial={mode.kind === 'edit' ? mode.item : undefined}
          busy={create.isPending || update.isPending}
          onCancel={() => {
            setMode(undefined);
          }}
          onSave={(body, fail) => {
            const handlers = (text: string) => ({
              onSuccess: () => {
                setMode(undefined);
                setSaved(text);
              },
              onError: (failure: unknown) => {
                fail(failureText(failure));
              },
            });
            if (mode.kind === 'edit') {
              update.mutate({ id: mode.item.id, body }, handlers(t('updated')));
            } else {
              create.mutate(body, handlers(t('created')));
            }
          }}
        />
      )}
      <StatusLine error={error} saved={saved !== undefined} savedText={saved ?? ''} />
      {types.isPending && (
        <p role="status" className="text-sm text-slate-500">
          {tCatalog('loading')}
        </p>
      )}
      {types.isError &&
        (errorCodeOf(types.error) === 'INTERNAL_ERROR' ? (
          <LoadFailed onRetry={() => void types.refetch()} />
        ) : (
          <p role="alert">{tErrors(errorCodeOf(types.error))}</p>
        ))}
      {types.isSuccess && (
        <Card className="overflow-hidden">
          <div className="flex items-center gap-3 border-b border-slate-200/80 px-6 py-4">
            <h2 className="text-base font-semibold text-slate-900">{t('activity.list_title')}</h2>
            <span className="text-xs font-medium text-slate-500 tabular-nums">
              {tCatalog('count', { count: items.length })}
            </span>
          </div>
          {items.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-slate-500">{t('activity.empty')}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.map((item) => (
                <li
                  key={item.id}
                  data-testid="activity-type-row"
                  className="flex flex-col gap-3 px-6 py-4 transition-colors duration-200 hover:bg-slate-50/70 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-sm font-medium break-words ${item.isActive ? 'text-slate-900' : 'text-slate-400'}`}
                      >
                        {label(item)}
                      </span>
                      <Badge tone={item.isActive ? 'emerald' : 'slate'}>
                        {item.isActive ? t('active') : t('inactive')}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500">
                      {t('sort_value', { value: item.sortOrder })}
                    </p>
                  </div>
                  {mode === undefined && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => {
                          open({ kind: 'edit', item });
                        }}
                      >
                        {t('edit')}
                      </Button>
                      <Button
                        variant={item.isActive ? 'quiet-danger' : 'secondary'}
                        disabled={update.isPending}
                        onClick={() => {
                          setActive(item, !item.isActive);
                        }}
                      >
                        {item.isActive ? t('deactivate') : t('activate')}
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-slate-200/80 px-6 py-3 text-xs text-slate-500">
            {t('activity.no_delete_hint')}
          </p>
        </Card>
      )}
    </div>
  );
}
