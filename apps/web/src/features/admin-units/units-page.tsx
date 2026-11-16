'use client';
// Birimler (F3.1, US-028). UX kararları: başlıkta tek ana eylem "Yeni birim"; birimler türe göre
// gruplu (ədəd, çəki, həcm, uzunluq, sahə, qablaşdırma); satırda ad, kısaltma, mono kod, rozetler
// (aktiv/passiv, onluq). Satır eylemleri: Düzenle, Pasifleştir/Aktivleştir. Silme yok (AC3): ipucu
// metni yalnız pasifleştirmenin mümkün olduğunu söyler. Altta dönüşüm oranları kartı (AC2).
import { pickLocalizedText, UNIT_KINDS, unitFailure } from '@b2b/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { errorCodeOf } from '../../lib/error-code';
import { ApiError } from '../admin-sellers/api';
import { LoadFailed, StatusLine } from '../seller-settings/status';
import { Badge, Button, Card, PageHeader } from '../ui/primitives';
import { type AdminUnit, useAdminUnits, useUnitMutations } from './api';
import { ConversionsCard } from './conversions-card';
import { UnitEditor, type UnitEditorMode } from './unit-editor';

export function UnitsPage() {
  const t = useTranslations('adminUnits');
  const tCatalog = useTranslations('adminCatalog');
  const tErrors = useTranslations('errors');
  const locale = useLocale();
  const catalog = useAdminUnits();
  const { update } = useUnitMutations();
  const [mode, setMode] = useState<UnitEditorMode | undefined>();
  const [saved, setSaved] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  const reset = () => {
    setSaved(undefined);
    setError(undefined);
  };

  function setActive(unit: AdminUnit, isActive: boolean) {
    reset();
    update.mutate(
      { code: unit.code, body: { isActive } },
      {
        onSuccess: () => {
          setSaved(isActive ? t('activated') : t('deactivated'));
        },
        onError: (failure) => {
          const outcome = unitFailure(failure instanceof ApiError ? failure : undefined);
          setError(
            outcome.kind === 'unit' ? t(`failure.${outcome.reason}`) : tErrors(outcome.code),
          );
        },
      },
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6 lg:py-12">
      <PageHeader
        eyebrow={tCatalog('eyebrow')}
        title={t('title')}
        description={t('description')}
        action={
          mode === undefined ? (
            <Button
              disabled={!catalog.isSuccess}
              onClick={() => {
                reset();
                setMode({ kind: 'create' });
              }}
            >
              {t('create_open')}
            </Button>
          ) : undefined
        }
      />
      {mode !== undefined && (
        <UnitEditor
          key={mode.kind === 'edit' ? mode.unit.code : 'create'}
          mode={mode}
          onDone={(text) => {
            setMode(undefined);
            setSaved(text === '' ? undefined : text);
          }}
        />
      )}
      <StatusLine error={error} saved={saved !== undefined} savedText={saved ?? ''} />
      {catalog.isPending && (
        <p role="status" className="text-sm text-slate-500">
          {t('loading')}
        </p>
      )}
      {catalog.isError &&
        (errorCodeOf(catalog.error) === 'INTERNAL_ERROR' ? (
          <LoadFailed onRetry={() => void catalog.refetch()} />
        ) : (
          <p role="alert">{tErrors(errorCodeOf(catalog.error))}</p>
        ))}
      {catalog.isSuccess && (
        <>
          <Card className="overflow-hidden">
            <div className="flex items-center gap-3 border-b border-slate-200/80 px-6 py-4">
              <h2 className="text-base font-semibold text-slate-900">{t('list_title')}</h2>
              <span className="text-xs font-medium text-slate-500 tabular-nums">
                {tCatalog('count', { count: catalog.data.items.length })}
              </span>
            </div>
            {catalog.data.items.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-slate-500">{t('empty')}</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {UNIT_KINDS.map((kind) => {
                  const group = catalog.data.items.filter((unit) => unit.kind === kind);
                  if (group.length === 0) return null;
                  return (
                    <section key={kind} aria-labelledby={`unit-kind-${kind}`}>
                      <h3
                        id={`unit-kind-${kind}`}
                        className="bg-slate-50/70 px-6 py-2 text-xs font-semibold tracking-wide text-slate-500 uppercase"
                      >
                        {t(`kind.${kind}`)}
                      </h3>
                      <ul className="divide-y divide-slate-100">
                        {group.map((unit) => (
                          <li
                            key={unit.code}
                            data-testid="unit-row"
                            data-code={unit.code}
                            className="flex flex-col gap-3 px-6 py-4 transition-colors duration-200 hover:bg-slate-50/70 lg:flex-row lg:items-center lg:justify-between"
                          >
                            <div className="min-w-0 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`truncate text-sm font-medium ${unit.isActive ? 'text-slate-900' : 'text-slate-400'}`}
                                >
                                  {pickLocalizedText(unit.name, locale) ?? unit.code}
                                </span>
                                <Badge tone={unit.isActive ? 'emerald' : 'slate'}>
                                  {unit.isActive ? t('active') : t('inactive')}
                                </Badge>
                                {unit.allowsDecimal && <Badge tone="amber">{t('decimal')}</Badge>}
                              </div>
                              <p className="text-xs text-slate-500">
                                <span className="font-mono">{unit.code}</span>
                                <span className="mx-2 text-slate-300">·</span>
                                {pickLocalizedText(unit.abbreviation, locale) ?? ''}
                              </p>
                            </div>
                            {mode === undefined && (
                              <div className="flex flex-wrap items-center gap-2">
                                <Button
                                  variant="secondary"
                                  onClick={() => {
                                    reset();
                                    setMode({ kind: 'edit', unit });
                                  }}
                                >
                                  {t('edit')}
                                </Button>
                                <Button
                                  variant="secondary"
                                  disabled={update.isPending}
                                  onClick={() => {
                                    setActive(unit, !unit.isActive);
                                  }}
                                >
                                  {unit.isActive ? t('deactivate') : t('activate')}
                                </Button>
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </div>
            )}
            <p className="border-t border-slate-200/80 px-6 py-3 text-xs text-slate-500">
              {t('no_delete_hint')}
            </p>
          </Card>
          <ConversionsCard units={catalog.data.items} conversions={catalog.data.conversions} />
        </>
      )}
    </div>
  );
}
