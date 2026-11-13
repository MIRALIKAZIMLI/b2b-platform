'use client';
// Şubeler (F2.5b, US-010). UX kararları: başlıkta tek ana eylem "Yeni şube" (form sayfa içinde
// açılır, liste bağlamı kaybolmaz); altında şube kartları. Her kartta ad, durum ve onay kuralı
// rozeti, bölge · adres, konum; eylemler ikincil düğme (düzenle, pasifleştir / etkinleştir). Silme
// yok (AC4); son aktif şube ve çalışanı / açık daveti olan şube pasifleşemez (409 → açıklayıcı
// mesaj, S3). Durumlar: yükleniyor, yükleme hatası (yeniden dene), boş (ilk şube ipucu), kaydedildi.
// `business.manage` yoksa veya işletme perakendeci değilse bilgi kartı (menüde de görünmez).
import {
  branchFailure,
  type BranchErrors,
  type BranchFormValues,
  branchFormValues,
  EMPTY_BRANCH_FORM,
  validateBranch,
} from '@b2b/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { ApiError, useRegionOptions } from '../admin-sellers/api';
import { useBusinessProfile } from '../buyer-registration/api';
import { LoadFailed, StatusLine } from '../seller-settings/status';
import { useShell } from '../shell/use-shell';
import { Badge, Button, Card, PageHeader } from '../ui/primitives';
import { type Branch, useBranches, useBranchMutations } from './api';
import { BranchForm } from './branch-form';

export function BranchesPage() {
  const t = useTranslations('branches');
  const tErrors = useTranslations('errors');
  const locale = useLocale();
  const shell = useShell();
  const permissions = shell.me?.activeBusiness?.permissions ?? [];
  const allowed =
    shell.me?.activeBusiness?.capability === 'buyer' &&
    permissions.some((item) => item.code === 'business.manage');
  const businessId = allowed ? shell.activeBusinessId : undefined;
  const list = useBranches(businessId);
  const regions = useRegionOptions(locale);
  const business = useBusinessProfile(businessId, allowed);
  const { create, update } = useBranchMutations(businessId);

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<BranchFormValues>(EMPTY_BRANCH_FORM);
  const [formErrors, setFormErrors] = useState<BranchErrors>({});
  const [editing, setEditing] = useState<
    { id: string; values: BranchFormValues; initial: BranchFormValues } | undefined
  >();
  const [editErrors, setEditErrors] = useState<BranchErrors>({});
  const [message, setMessage] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);

  const regionLabel = useMemo(() => {
    const map = new Map((regions.data ?? []).map((item) => [item.id, item.label]));
    return (id: string | null) => (id === null ? undefined : map.get(id));
  }, [regions.data]);

  const begin = () => {
    setMessage(undefined);
    setSaved(false);
  };
  const failure = (error: unknown) => {
    const result = branchFailure(error instanceof ApiError ? error : undefined);
    if (result.kind === 'last_active') setMessage(t('error.last_active'));
    else if (result.kind === 'in_use') {
      setMessage(t('error.in_use', { members: result.members, invitations: result.invitations }));
    } else setMessage(tErrors(result.code));
  };

  function onCreate() {
    begin();
    const result = validateBranch(form);
    if (!result.ok) {
      setFormErrors(result.errors);
      return;
    }
    setFormErrors({});
    create.mutate(result.body, {
      onSuccess: () => {
        setForm(EMPTY_BRANCH_FORM);
        setCreating(false);
        setSaved(true);
      },
      onError: failure,
    });
  }

  function onSaveEdit() {
    if (editing === undefined) return;
    begin();
    const result = validateBranch(editing.values, editing.initial);
    if (!result.ok) {
      setEditErrors(result.errors);
      return;
    }
    setEditErrors({});
    if (Object.keys(result.body).length === 0) {
      setEditing(undefined);
      return;
    }
    update.mutate(
      { id: editing.id, body: result.body },
      {
        onSuccess: () => {
          setEditing(undefined);
          setSaved(true);
        },
        onError: failure,
      },
    );
  }

  function toggleStatus(branch: Branch) {
    begin();
    update.mutate(
      { id: branch.id, body: { status: branch.status === 'active' ? 'inactive' : 'active' } },
      {
        onSuccess: () => {
          setSaved(true);
        },
        onError: failure,
      },
    );
  }

  if (shell.me !== undefined && !allowed) {
    return (
      <div className="space-y-8 px-4 py-8 sm:px-6 lg:py-10">
        <PageHeader title={t('title')} />
        <Card className="p-8 text-sm text-slate-600">{t('not_allowed')}</Card>
      </div>
    );
  }

  const branches = list.data ?? [];
  const busy = create.isPending || update.isPending;
  const regionOptions = regions.data ?? [];
  const currency = business.data?.currency;

  return (
    <div className="space-y-8 px-4 py-8 sm:px-6 lg:py-10">
      <PageHeader
        title={t('title')}
        description={t('description')}
        action={
          !creating && (
            <Button
              onClick={() => {
                begin();
                setCreating(true);
              }}
              disabled={list.data === undefined}
            >
              {t('new')}
            </Button>
          )
        }
      />

      <div className="max-w-4xl space-y-6">
        {creating && (
          <Card className="space-y-5 p-6 sm:p-8">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-slate-900">{t('new_title')}</h2>
              <p className="text-sm text-slate-500">{t('new_hint')}</p>
            </div>
            <BranchForm
              idPrefix="branch-new"
              values={form}
              errors={formErrors}
              regions={regionOptions}
              currency={currency}
              busy={busy}
              submitLabel={t('add')}
              onChange={(next) => {
                setForm(next);
                setFormErrors({});
              }}
              onSubmit={onCreate}
              onCancel={() => {
                setCreating(false);
                setForm(EMPTY_BRANCH_FORM);
                setFormErrors({});
              }}
            />
          </Card>
        )}

        <StatusLine error={message} saved={saved} savedText={t('saved')} />

        {list.isError ? (
          <LoadFailed onRetry={() => void list.refetch()} />
        ) : (
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200/80 px-6 py-4">
              <h2 className="text-base font-semibold text-slate-900">{t('list_title')}</h2>
              <span className="text-xs font-medium text-slate-500 tabular-nums">
                {t('count', { count: branches.length })}
              </span>
            </div>
            {list.data === undefined ? (
              <p className="px-6 py-10 text-center text-sm text-slate-500">{t('loading')}</p>
            ) : branches.length === 0 ? (
              <div className="space-y-1 px-6 py-12 text-center">
                <p className="text-sm font-medium text-slate-900">{t('empty')}</p>
                <p className="text-sm text-slate-500">{t('empty_hint')}</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {branches.map((branch) => {
                  const inactive = branch.status === 'inactive';
                  const isEditing = editing?.id === branch.id;
                  const place = [regionLabel(branch.regionId), branch.addressLine]
                    .filter((part) => part !== undefined && part !== null && part !== '')
                    .join(' · ');
                  return (
                    <li
                      key={branch.id}
                      data-testid="branch-row"
                      className={`px-6 py-5 transition-colors duration-200 hover:bg-slate-50/70 ${inactive ? 'opacity-70' : ''}`}
                    >
                      {isEditing ? (
                        <BranchForm
                          idPrefix={`branch-${branch.id}`}
                          values={editing.values}
                          errors={editErrors}
                          regions={regionOptions}
                          currency={currency}
                          busy={busy}
                          submitLabel={t('save')}
                          onChange={(values) => {
                            setEditing({ ...editing, values });
                            setEditErrors({});
                          }}
                          onSubmit={onSaveEdit}
                          onCancel={() => {
                            setEditing(undefined);
                            setEditErrors({});
                          }}
                        />
                      ) : (
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0 space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-semibold text-slate-900">
                                {branch.name}
                              </p>
                              <Badge tone={branch.approvalRule === 'none' ? 'slate' : 'amber'}>
                                {branch.approvalRule === 'above_amount' &&
                                branch.approvalThreshold !== null
                                  ? t('rule_badge.above_amount', {
                                      amount: branch.approvalThreshold,
                                      currency: currency ?? '',
                                    })
                                  : t(`rule_badge.${branch.approvalRule}`)}
                              </Badge>
                              {inactive && <Badge tone="slate">{t('inactive')}</Badge>}
                            </div>
                            <p className="truncate text-sm text-slate-500">
                              {place === '' ? t('no_address') : place}
                            </p>
                            <p className="text-xs text-slate-400 tabular-nums">
                              {branch.lat !== null && branch.lng !== null
                                ? `${String(branch.lat)}, ${String(branch.lng)}`
                                : t('no_location')}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="secondary"
                              disabled={busy}
                              onClick={() => {
                                begin();
                                const values = branchFormValues(branch);
                                setEditing({ id: branch.id, values, initial: values });
                              }}
                            >
                              {t('edit')}
                            </Button>
                            <Button
                              variant={inactive ? 'secondary' : 'quiet-danger'}
                              disabled={busy}
                              onClick={() => {
                                toggleStatus(branch);
                              }}
                            >
                              {inactive ? t('activate') : t('deactivate')}
                            </Button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        )}
        <p className="text-xs text-slate-500">{t('no_delete_note')}</p>
      </div>
    </div>
  );
}
