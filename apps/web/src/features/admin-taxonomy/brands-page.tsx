'use client';
// Markalar ve marka talepleri (F3.2b, US-029 AC2). UX kararları: durum sekmeleri (Talepler / Aktif /
// Reddedilen), açılışta Talepler (onay kuyruğu); ad araması. Talep satırında talep eden toptancı ve
// tarih; "Onayla" tek tık (geri alınabilir: pasifleştirilebilir), "Reddet" geri alınamaz olduğu için
// onay penceresi ister. Admin markası doğrudan aktif açılır; aktif markada ad düzeltme ve
// pasifleştirme. Silme yok (R38).
import { BRAND_NAME_MAX, type BrandStatus, brandFormBody } from '@b2b/shared';
import { useTranslations } from 'next-intl';
import { type SyntheticEvent, useEffect, useId, useState } from 'react';
import { useFormatDay } from '../admin-buyers/use-format';
import { errorCodeOf } from '../../lib/error-code';
import { LoadFailed, StatusLine } from '../seller-settings/status';
import { Dialog } from '../ui/dialog';
import { Badge, Button, Card, Field, PageHeader, TextInput } from '../ui/primitives';
import { type AdminBrand, useAdminBrands, useBrandMutations } from './api';
import { useFailureText } from './failure';

const TABS: readonly BrandStatus[] = ['requested', 'active', 'rejected'];

type Mode = { readonly kind: 'create' } | { readonly kind: 'edit'; readonly brand: AdminBrand };

export function BrandsPage() {
  const t = useTranslations('adminTaxonomy');
  const tCatalog = useTranslations('adminCatalog');
  const tErrors = useTranslations('errors');
  const formatDay = useFormatDay();
  const failureText = useFailureText();
  const [status, setStatus] = useState<BrandStatus>('requested');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const brands = useAdminBrands(status, query);
  const { update } = useBrandMutations();
  const [mode, setMode] = useState<Mode | undefined>();
  const [rejecting, setRejecting] = useState<AdminBrand | undefined>();
  const [saved, setSaved] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim().slice(0, BRAND_NAME_MAX));
    }, 300);
    return () => {
      clearTimeout(timer);
    };
  }, [search]);

  const clear = () => {
    setSaved(undefined);
    setError(undefined);
  };

  function patch(
    brand: AdminBrand,
    body: Parameters<typeof update.mutate>[0]['body'],
    text: string,
  ) {
    clear();
    update.mutate(
      { id: brand.id, body },
      {
        onSuccess: () => {
          setSaved(text);
          setRejecting(undefined);
        },
        onError: (failure) => {
          setError(failureText(failure));
          setRejecting(undefined);
        },
      },
    );
  }

  const items = brands.data ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6 lg:py-12">
      <PageHeader
        eyebrow={tCatalog('eyebrow')}
        title={t('brand.title')}
        description={t('brand.description')}
        action={
          mode === undefined ? (
            <Button
              onClick={() => {
                clear();
                setMode({ kind: 'create' });
              }}
            >
              {t('brand.create_open')}
            </Button>
          ) : undefined
        }
      />
      {mode !== undefined && (
        <BrandEditor
          key={mode.kind === 'edit' ? mode.brand.id : 'create'}
          mode={mode}
          onDone={(text) => {
            setMode(undefined);
            setSaved(text);
            if (mode.kind === 'create') setStatus('active');
          }}
          onCancel={() => {
            setMode(undefined);
          }}
        />
      )}
      <StatusLine error={error} saved={saved !== undefined} savedText={saved ?? ''} />
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-slate-200/80 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div
            role="tablist"
            aria-label={t('brand.tabs_label')}
            className="inline-flex w-full rounded-xl bg-slate-100/80 p-1 sm:w-auto"
          >
            {TABS.map((tab) => {
              const selected = tab === status;
              return (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  data-testid={`brand-tab-${tab}`}
                  onClick={() => {
                    clear();
                    setStatus(tab);
                  }}
                  className={`flex-1 rounded-lg px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-all duration-200 focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none sm:flex-none ${
                    selected
                      ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {t(`brand.tab.${tab}`)}
                </button>
              );
            })}
          </div>
          <div className="w-full lg:max-w-xs">
            <label htmlFor="brand-search" className="sr-only">
              {t('brand.search_label')}
            </label>
            <TextInput
              id="brand-search"
              type="search"
              autoComplete="off"
              maxLength={BRAND_NAME_MAX}
              placeholder={t('brand.search_placeholder')}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
              }}
            />
          </div>
        </div>
        {brands.isPending && (
          <p role="status" className="px-6 py-10 text-center text-sm text-slate-500">
            {tCatalog('loading')}
          </p>
        )}
        {brands.isError &&
          (errorCodeOf(brands.error) === 'INTERNAL_ERROR' ? (
            <div className="p-6">
              <LoadFailed onRetry={() => void brands.refetch()} />
            </div>
          ) : (
            <p role="alert" className="px-6 py-10 text-center text-sm text-rose-700">
              {tErrors(errorCodeOf(brands.error))}
            </p>
          ))}
        {brands.isSuccess &&
          (items.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm text-slate-500">
              {query === '' ? t(`brand.empty.${status}`) : t('brand.no_match')}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.map((brand) => (
                <li
                  key={brand.id}
                  data-testid="brand-row"
                  data-name={brand.name}
                  className="flex flex-col gap-3 px-6 py-4 transition-colors duration-200 hover:bg-slate-50/70 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-sm font-medium break-words ${brand.status === 'active' && brand.isActive ? 'text-slate-900' : 'text-slate-500'}`}
                      >
                        {brand.name}
                      </span>
                      {brand.status === 'requested' && (
                        <Badge tone="amber">{t('brand.badge.requested')}</Badge>
                      )}
                      {brand.status === 'active' && (
                        <Badge tone={brand.isActive ? 'emerald' : 'slate'}>
                          {brand.isActive ? t('active') : t('inactive')}
                        </Badge>
                      )}
                      {brand.status === 'rejected' && (
                        <Badge tone="slate">{t('brand.badge.rejected')}</Badge>
                      )}
                    </div>
                    <p className="text-xs break-words text-slate-500">
                      {brand.requestedBy === null
                        ? t('brand.by_platform')
                        : t('brand.by_seller', {
                            name: brand.requestedBy.legalName ?? t('brand.unknown_seller'),
                          })}
                      <span className="mx-2 text-slate-300">·</span>
                      {t('brand.created_on', { date: formatDay(brand.createdAt) })}
                      {brand.decidedAt !== null && brand.requestedBy !== null && (
                        <>
                          <span className="mx-2 text-slate-300">·</span>
                          {t('brand.decided_on', { date: formatDay(brand.decidedAt) })}
                        </>
                      )}
                    </p>
                  </div>
                  {mode === undefined && (
                    <div className="flex flex-wrap items-center gap-2">
                      {brand.status === 'requested' && (
                        <>
                          <Button
                            disabled={update.isPending}
                            onClick={() => {
                              patch(brand, { status: 'active' }, t('brand.approved'));
                            }}
                          >
                            {t('brand.approve')}
                          </Button>
                          <Button
                            variant="quiet-danger"
                            disabled={update.isPending}
                            onClick={() => {
                              clear();
                              setRejecting(brand);
                            }}
                          >
                            {t('brand.reject')}
                          </Button>
                        </>
                      )}
                      {brand.status !== 'rejected' && (
                        <Button
                          variant="secondary"
                          onClick={() => {
                            clear();
                            setMode({ kind: 'edit', brand });
                          }}
                        >
                          {t('edit')}
                        </Button>
                      )}
                      {brand.status === 'active' && (
                        <Button
                          variant={brand.isActive ? 'quiet-danger' : 'secondary'}
                          disabled={update.isPending}
                          onClick={() => {
                            patch(
                              brand,
                              { isActive: !brand.isActive },
                              brand.isActive ? t('deactivated') : t('activated'),
                            );
                          }}
                        >
                          {brand.isActive ? t('deactivate') : t('activate')}
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ))}
        <p className="border-t border-slate-200/80 px-6 py-3 text-xs text-slate-500">
          {t('brand.no_delete_hint')}
        </p>
      </Card>
      {rejecting !== undefined && (
        <RejectDialog
          brand={rejecting}
          busy={update.isPending}
          onClose={() => {
            setRejecting(undefined);
          }}
          onConfirm={() => {
            patch(rejecting, { status: 'rejected' }, t('brand.rejected'));
          }}
        />
      )}
    </div>
  );
}

function RejectDialog({
  brand,
  busy,
  onClose,
  onConfirm,
}: {
  brand: AdminBrand;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations('adminTaxonomy');
  const titleId = useId();
  const bodyId = useId();
  return (
    <Dialog labelledBy={titleId} describedBy={bodyId} onClose={onClose} tone="danger">
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="text-xs font-semibold tracking-wider text-rose-600 uppercase">
            {t('brand.reject_eyebrow')}
          </p>
          <h2 id={titleId} className="text-lg font-semibold break-words text-slate-900">
            {t('brand.reject_title', { name: brand.name })}
          </h2>
        </div>
        <p
          id={bodyId}
          className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 text-sm text-slate-600"
        >
          {t('brand.reject_body')}
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} data-autofocus>
            {t('cancel')}
          </Button>
          <Button variant="danger" disabled={busy} onClick={onConfirm}>
            {t('brand.reject_confirm')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function BrandEditor({
  mode,
  onDone,
  onCancel,
}: {
  mode: Mode;
  onDone: (saved: string) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('adminTaxonomy');
  const tCatalog = useTranslations('adminCatalog');
  const failureText = useFailureText();
  const { create, update } = useBrandMutations();
  const editing = mode.kind === 'edit' ? mode.brand : undefined;
  const [name, setName] = useState(editing?.name ?? '');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [message, setMessage] = useState<string | undefined>();

  function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = brandFormBody(name);
    if (!result.ok) {
      setFieldError(tCatalog(`error.${result.error}`));
      return;
    }
    const onError = (failure: unknown) => {
      setMessage(failureText(failure));
    };
    if (editing === undefined) {
      create.mutate(result.body, {
        onSuccess: () => {
          onDone(t('brand.created'));
        },
        onError,
      });
    } else {
      update.mutate(
        { id: editing.id, body: result.body },
        {
          onSuccess: () => {
            onDone(t('updated'));
          },
          onError,
        },
      );
    }
  }

  return (
    <Card className="space-y-6 p-6 sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h2 className="text-base font-semibold text-slate-900">
            {editing === undefined ? t('brand.create_title') : t('brand.edit_title')}
          </h2>
          <p className="text-sm text-slate-500">{t('brand.editor_hint')}</p>
        </div>
        <Button variant="secondary" onClick={onCancel}>
          {t('cancel')}
        </Button>
      </div>
      <form noValidate onSubmit={onSubmit} className="space-y-6" data-testid="brand-form">
        <Field
          id="brand-name"
          label={t('brand.field_name')}
          error={fieldError}
          className="max-w-md"
        >
          <TextInput
            id="brand-name"
            name="name"
            autoComplete="off"
            maxLength={BRAND_NAME_MAX}
            value={name}
            invalid={fieldError !== undefined}
            aria-invalid={fieldError !== undefined}
            onChange={(event) => {
              setName(event.target.value);
              setFieldError(undefined);
              setMessage(undefined);
            }}
          />
        </Field>
        <StatusLine error={message} saved={false} savedText="" />
        <Button type="submit" disabled={create.isPending || update.isPending}>
          {t('save')}
        </Button>
      </form>
    </Card>
  );
}
