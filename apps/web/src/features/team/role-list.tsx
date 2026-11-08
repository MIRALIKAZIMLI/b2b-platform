'use client';
// Rollar kartı (F2.8, US-014): işletmenin rolleri, izin sayısı ve "Özəl" rozeti. Başlıkta tek eylem
// "Şablondan yeni rol"; yalnız özel rollerde satır eylemi "Düzənlə" (şablon kopyaları F2.9'a kadar
// sabit). Düzenleyici kartın üstünde açılır.
import { type GrantActor, pickLocalizedText } from '@b2b/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { StatusLine } from '../seller-settings/status';
import { Badge, Button, Card } from '../ui/primitives';
import { type RoleTemplate, type TeamRole } from './api';
import { RoleEditor, type RoleEditorMode } from './role-editor';

export function RoleList({
  businessId,
  capability,
  roles,
  templates,
  actor,
}: {
  businessId: string | undefined;
  capability: 'seller' | 'buyer';
  roles: readonly TeamRole[] | undefined;
  templates: readonly RoleTemplate[] | undefined;
  actor: GrantActor;
}) {
  const t = useTranslations('team');
  const locale = useLocale();
  const [mode, setMode] = useState<RoleEditorMode | undefined>();
  const [saved, setSaved] = useState<string | undefined>();
  const list = roles ?? [];

  return (
    <div className="space-y-4">
      {mode !== undefined && templates !== undefined && (
        <RoleEditor
          key={mode.kind === 'edit' ? mode.role.id : 'create'}
          businessId={businessId}
          capability={capability}
          mode={mode}
          templates={templates}
          actor={actor}
          onDone={(text) => {
            setMode(undefined);
            setSaved(text === '' ? undefined : text);
          }}
        />
      )}
      <StatusLine error={undefined} saved={saved !== undefined} savedText={saved ?? ''} />
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 px-6 py-4">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-slate-900">{t('role.title')}</h2>
            <span className="text-xs font-medium text-slate-500 tabular-nums">
              {t('role.count', { count: list.length })}
            </span>
          </div>
          {mode === undefined && (
            <Button
              variant="secondary"
              disabled={templates === undefined}
              onClick={() => {
                setSaved(undefined);
                setMode({ kind: 'create' });
              }}
            >
              {t('role.create_open')}
            </Button>
          )}
        </div>
        {roles === undefined ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">{t('loading')}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {list.map((role) => (
              <li
                key={role.id}
                data-testid="role-row"
                className="flex flex-col gap-3 px-6 py-4 transition-colors duration-200 hover:bg-slate-50/70 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-slate-900">
                      {pickLocalizedText(role.name, locale) ?? role.id}
                    </span>
                    {role.isBusinessAdmin && <Badge tone="emerald">{t('role.badge_admin')}</Badge>}
                    {role.isCustom && <Badge tone="slate">{t('role.badge_custom')}</Badge>}
                  </div>
                  <p className="text-xs text-slate-500 tabular-nums">
                    {role.isBusinessAdmin
                      ? t('role.all_permissions')
                      : t('role.permission_count', { count: role.permissions.length })}
                  </p>
                </div>
                {role.isCustom && mode === undefined && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSaved(undefined);
                      setMode({ kind: 'edit', role });
                    }}
                  >
                    {t('role.edit')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
