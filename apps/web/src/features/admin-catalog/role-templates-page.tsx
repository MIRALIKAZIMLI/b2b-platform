'use client';
// Rol şablonları (F2.9b, US-012). UX kararları: başlıkta tek ana eylem "Yeni şablon"; liste
// yeteneğe göre iki bölüm (toptancı / perakendeci); satırda ad, kod, sürüm, izin sayısı ve admin
// rozeti; satır eylemi "Düzenle". Düzenleyici listenin üstünde açılır, kayıt sonucu durum satırında.
import { pickLocalizedText } from '@b2b/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { errorCodeOf } from '../../lib/error-code';
import { LoadFailed, StatusLine } from '../seller-settings/status';
import { Badge, Button, Card, PageHeader } from '../ui/primitives';
import { type AdminRoleTemplate, useRoleTemplates } from './api';
import { RoleTemplateEditor, type TemplateEditorMode } from './role-template-editor';

export function RoleTemplatesPage() {
  const t = useTranslations('adminCatalog');
  const tErrors = useTranslations('errors');
  const locale = useLocale();
  const templates = useRoleTemplates();
  const [mode, setMode] = useState<TemplateEditorMode | undefined>();
  const [saved, setSaved] = useState<string | undefined>();

  const open = (next: TemplateEditorMode) => {
    setSaved(undefined);
    setMode(next);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6 lg:py-12">
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('template.title')}
        description={t('template.description')}
        action={
          mode === undefined ? (
            <Button
              onClick={() => {
                open({ kind: 'create' });
              }}
            >
              {t('template.create_open')}
            </Button>
          ) : undefined
        }
      />
      {mode !== undefined && (
        <RoleTemplateEditor
          key={mode.kind === 'edit' ? mode.template.id : 'create'}
          mode={mode}
          onDone={(text) => {
            setMode(undefined);
            setSaved(text === '' ? undefined : text);
          }}
        />
      )}
      <StatusLine error={undefined} saved={saved !== undefined} savedText={saved ?? ''} />
      {templates.isPending && (
        <p role="status" className="text-sm text-slate-500">
          {t('loading')}
        </p>
      )}
      {templates.isError &&
        (errorCodeOf(templates.error) === 'INTERNAL_ERROR' ? (
          <LoadFailed onRetry={() => void templates.refetch()} />
        ) : (
          <p role="alert">{tErrors(errorCodeOf(templates.error))}</p>
        ))}
      {templates.isSuccess &&
        (['seller', 'buyer'] as const).map((capability) => (
          <TemplateSection
            key={capability}
            title={t(`capability.${capability}`)}
            items={templates.data.filter((item) => item.capability === capability)}
            locale={locale}
            editable={mode === undefined}
            onEdit={(template) => {
              open({ kind: 'edit', template });
            }}
          />
        ))}
    </div>
  );
}

function TemplateSection({
  title,
  items,
  locale,
  editable,
  onEdit,
}: {
  title: string;
  items: AdminRoleTemplate[];
  locale: string;
  editable: boolean;
  onEdit: (template: AdminRoleTemplate) => void;
}) {
  const t = useTranslations('adminCatalog');
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 border-b border-slate-200/80 px-6 py-4">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <span className="text-xs font-medium text-slate-500 tabular-nums">
          {t('count', { count: items.length })}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="px-6 py-10 text-center text-sm text-slate-500">{t('template.empty')}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((template) => (
            <li
              key={template.id}
              data-testid="template-row"
              data-code={template.code}
              className="flex flex-col gap-3 px-6 py-4 transition-colors duration-200 hover:bg-slate-50/70 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium text-slate-900">
                    {pickLocalizedText(template.name, locale) ?? template.code}
                  </span>
                  {template.isBusinessAdmin && (
                    <Badge tone="emerald">{t('template.admin_badge')}</Badge>
                  )}
                  <Badge tone="slate">{t('template.version', { version: template.version })}</Badge>
                </div>
                <p className="font-mono text-xs text-slate-500">
                  {template.code}
                  <span className="mx-2 text-slate-300">·</span>
                  <span className="font-sans tabular-nums">
                    {t('permission_count', { count: template.permissions.length })}
                  </span>
                </p>
              </div>
              {editable && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    onEdit(template);
                  }}
                >
                  {t('edit')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
