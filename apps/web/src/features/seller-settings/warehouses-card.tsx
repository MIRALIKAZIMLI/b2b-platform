'use client';
// Depolar (US-011): üstte yeni depo formu, altta liste. İlk depo varsayılan olur (AC1); plan sınırı
// aşılınca plan yükseltme mesajı (AC2); depo silinmez, pasifleştirilir (AC3). Satır eylemleri:
// düzenle (ad / adres), varsayılan yap, pasifleştir / etkinleştir. Varsayılan depoda pasifleştirme
// düğmesi yoktur; kural API'de de vardır (409).
import {
  sellerSetupFailure,
  validateWarehouse,
  WAREHOUSE_ADDRESS_MAX,
  WAREHOUSE_NAME_MAX,
  type WarehouseErrors,
  type WarehouseFormValues,
} from '@b2b/shared';
import { useTranslations } from 'next-intl';
import { type SyntheticEvent, useState } from 'react';
import { ApiError } from '../admin-sellers/api';
import { Badge, Button, Card, Field, TextInput } from '../ui/primitives';
import { useWarehouseMutations, useWarehouses, type Warehouse } from './api';
import { LoadFailed, StatusLine } from './status';

const EMPTY: WarehouseFormValues = { name: '', addressLine: '' };

function WarehouseFields({
  idPrefix,
  values,
  errors,
  onChange,
}: {
  idPrefix: string;
  values: WarehouseFormValues;
  errors: WarehouseErrors;
  onChange: (next: WarehouseFormValues) => void;
}) {
  const t = useTranslations('sellerSettings');
  const error = (field: keyof WarehouseFormValues) => {
    const reason = errors[field];
    return reason === undefined ? undefined : t(`error.${reason}`);
  };
  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <Field id={`${idPrefix}-name`} label={t('warehouses.name')} error={error('name')}>
        <TextInput
          id={`${idPrefix}-name`}
          maxLength={WAREHOUSE_NAME_MAX}
          value={values.name}
          invalid={errors.name !== undefined}
          onChange={(event) => {
            onChange({ ...values, name: event.target.value });
          }}
        />
      </Field>
      <Field
        id={`${idPrefix}-address`}
        label={t('warehouses.address')}
        hint={t('warehouses.address_hint')}
        error={error('addressLine')}
      >
        <TextInput
          id={`${idPrefix}-address`}
          maxLength={WAREHOUSE_ADDRESS_MAX}
          autoComplete="street-address"
          value={values.addressLine}
          invalid={errors.addressLine !== undefined}
          onChange={(event) => {
            onChange({ ...values, addressLine: event.target.value });
          }}
        />
      </Field>
    </div>
  );
}

export function WarehousesCard({ businessId }: { businessId: string | undefined }) {
  const t = useTranslations('sellerSettings');
  const tErrors = useTranslations('errors');
  const list = useWarehouses(businessId);
  const { create, update } = useWarehouseMutations(businessId);
  const [form, setForm] = useState<WarehouseFormValues>(EMPTY);
  const [formErrors, setFormErrors] = useState<WarehouseErrors>({});
  const [editing, setEditing] = useState<{ id: string; values: WarehouseFormValues } | undefined>();
  const [editErrors, setEditErrors] = useState<WarehouseErrors>({});
  const [message, setMessage] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);

  const failure = (error: unknown) => {
    const result = sellerSetupFailure(error instanceof ApiError ? error : undefined);
    setMessage(result.kind === 'code' ? tErrors(result.code) : t(`error.${result.kind}`));
  };
  const begin = () => {
    setMessage(undefined);
    setSaved(false);
  };

  function onCreate(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    begin();
    const result = validateWarehouse(form);
    if (!result.ok) {
      setFormErrors(result.errors);
      return;
    }
    setFormErrors({});
    create.mutate(result.body, {
      onSuccess: () => {
        setForm(EMPTY);
        setSaved(true);
      },
      onError: failure,
    });
  }

  function onSaveEdit(warehouse: Warehouse) {
    if (editing === undefined) return;
    begin();
    const result = validateWarehouse(editing.values);
    if (!result.ok) {
      setEditErrors(result.errors);
      return;
    }
    setEditErrors({});
    const addressLine = result.body.addressLine ?? null;
    const body = {
      ...(result.body.name === warehouse.name ? {} : { name: result.body.name }),
      ...(addressLine === warehouse.addressLine ? {} : { addressLine }),
    };
    if (Object.keys(body).length === 0) {
      setEditing(undefined);
      return;
    }
    update.mutate(
      { id: warehouse.id, body },
      {
        onSuccess: () => {
          setEditing(undefined);
          setSaved(true);
        },
        onError: failure,
      },
    );
  }

  function act(id: string, body: { isDefault?: true; status?: 'active' | 'inactive' }) {
    begin();
    update.mutate(
      { id, body },
      {
        onSuccess: () => {
          setSaved(true);
        },
        onError: failure,
      },
    );
  }

  if (list.isError) return <LoadFailed onRetry={() => void list.refetch()} />;
  const warehouses = list.data ?? [];
  const busy = create.isPending || update.isPending;

  return (
    <div className="space-y-6">
      <Card className="space-y-5 p-6 sm:p-8">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-slate-900">{t('warehouses.new_title')}</h2>
          <p className="text-sm text-slate-500">
            {warehouses.length === 0 ? t('warehouses.first_hint') : t('warehouses.new_hint')}
          </p>
        </div>
        <form noValidate onSubmit={onCreate} className="space-y-4">
          <WarehouseFields
            idPrefix="warehouse-new"
            values={form}
            errors={formErrors}
            onChange={(next) => {
              setForm(next);
              setFormErrors({});
            }}
          />
          <Button type="submit" disabled={busy || list.data === undefined}>
            {t('warehouses.add')}
          </Button>
        </form>
      </Card>

      <StatusLine error={message} saved={saved} savedText={t('saved')} />

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200/80 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">{t('warehouses.title')}</h2>
          <span className="text-xs font-medium text-slate-500 tabular-nums">
            {t('warehouses.count', { count: warehouses.length })}
          </span>
        </div>
        {list.data === undefined ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">{t('loading')}</p>
        ) : warehouses.length === 0 ? (
          <div className="space-y-1 px-6 py-12 text-center">
            <p className="text-sm font-medium text-slate-900">{t('warehouses.empty')}</p>
            <p className="text-sm text-slate-500">{t('warehouses.empty_hint')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {warehouses.map((warehouse) => {
              const inactive = warehouse.status === 'inactive';
              const isEditing = editing?.id === warehouse.id;
              return (
                <li
                  key={warehouse.id}
                  data-testid="warehouse-row"
                  className={`px-6 py-4 transition-colors duration-200 hover:bg-slate-50/70 ${inactive ? 'opacity-70' : ''}`}
                >
                  {isEditing ? (
                    <div className="space-y-4">
                      <WarehouseFields
                        idPrefix={`warehouse-${warehouse.id}`}
                        values={editing.values}
                        errors={editErrors}
                        onChange={(values) => {
                          setEditing({ id: warehouse.id, values });
                          setEditErrors({});
                        }}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          disabled={busy}
                          onClick={() => {
                            onSaveEdit(warehouse);
                          }}
                        >
                          {t('save')}
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setEditing(undefined);
                            setEditErrors({});
                          }}
                        >
                          {t('cancel')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {warehouse.name}
                          </p>
                          {warehouse.isDefault && (
                            <Badge tone="emerald">{t('warehouses.default')}</Badge>
                          )}
                          {inactive && <Badge tone="slate">{t('warehouses.inactive')}</Badge>}
                        </div>
                        <p className="truncate text-sm text-slate-500">
                          {warehouse.addressLine ?? t('warehouses.no_address')}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          disabled={busy}
                          onClick={() => {
                            begin();
                            setEditing({
                              id: warehouse.id,
                              values: {
                                name: warehouse.name,
                                addressLine: warehouse.addressLine ?? '',
                              },
                            });
                          }}
                        >
                          {t('warehouses.edit')}
                        </Button>
                        {!warehouse.isDefault && !inactive && (
                          <Button
                            variant="secondary"
                            disabled={busy}
                            onClick={() => {
                              act(warehouse.id, { isDefault: true });
                            }}
                          >
                            {t('warehouses.make_default')}
                          </Button>
                        )}
                        {!warehouse.isDefault && (
                          <Button
                            variant={inactive ? 'secondary' : 'quiet-danger'}
                            disabled={busy}
                            onClick={() => {
                              act(warehouse.id, { status: inactive ? 'active' : 'inactive' });
                            }}
                          >
                            {inactive ? t('warehouses.activate') : t('warehouses.deactivate')}
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <p className="text-xs text-slate-500">{t('warehouses.no_delete_note')}</p>
    </div>
  );
}
