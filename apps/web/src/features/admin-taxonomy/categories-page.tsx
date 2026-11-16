'use client';
// Kategoriler (F3.2b, US-029 AC1). UX kararları: tek ana eylem "Yeni üst kategori"; ağaç tek kartta
// girintili liste (seviye çizgisi + seviye rozeti), her üstün hemen ardından altları. Alt kategori
// satırdan eklenir (üst sabit, K4); 3. seviyede ve pasif dalda bu düğme yoktur (AC3). Pasif üstün
// altları "üst pasif" rozetiyle soluk görünür (genel listede yoklar). Silme yok: yalnız pasifleştirme.
import { categoryTree, type CategoryTreeItem, pickLocalizedText } from '@b2b/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { errorCodeOf } from '../../lib/error-code';
import { LoadFailed, StatusLine } from '../seller-settings/status';
import { Badge, Button, Card, PageHeader } from '../ui/primitives';
import { type AdminCategory, useAdminCategories, useCategoryMutations } from './api';
import { EntryEditor } from './entry-editor';
import { useFailureText } from './failure';

type Item = CategoryTreeItem<AdminCategory>;
type Mode =
  | { readonly kind: 'create'; readonly parent: Item | null }
  | { readonly kind: 'edit'; readonly item: Item };

const INDENT = ['', 'sm:pl-10', 'sm:pl-20'] as const;

export function CategoriesPage() {
  const t = useTranslations('adminTaxonomy');
  const tCatalog = useTranslations('adminCatalog');
  const tErrors = useTranslations('errors');
  const locale = useLocale();
  const failureText = useFailureText();
  const categories = useAdminCategories();
  const { create, update } = useCategoryMutations();
  const [mode, setMode] = useState<Mode | undefined>();
  const [saved, setSaved] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  const label = (item: AdminCategory) => pickLocalizedText(item.name, locale) ?? item.id;
  const tree = categories.data === undefined ? [] : categoryTree(categories.data, label);
  const activeCount = tree.filter((item) => item.isActive && !item.parentInactive).length;

  const open = (next: Mode) => {
    setSaved(undefined);
    setError(undefined);
    setMode(next);
  };

  function setActive(item: Item, isActive: boolean) {
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

  const editor =
    mode === undefined ? null : (
      <EntryEditor
        key={mode.kind === 'edit' ? mode.item.id : `create-${mode.parent?.id ?? 'root'}`}
        testId="category-form"
        title={
          mode.kind === 'edit'
            ? t('category.edit_title')
            : mode.parent === null
              ? t('category.create_root_title')
              : t('category.create_child_title')
        }
        hint={t('category.editor_hint')}
        parentName={mode.kind === 'create' && mode.parent !== null ? label(mode.parent) : undefined}
        initial={mode.kind === 'edit' ? mode.item : undefined}
        busy={create.isPending || update.isPending}
        onCancel={() => {
          setMode(undefined);
        }}
        onSave={(body, fail) => {
          const done = (text: string) => {
            setMode(undefined);
            setSaved(text);
          };
          if (mode.kind === 'edit') {
            update.mutate(
              { id: mode.item.id, body },
              {
                onSuccess: () => {
                  done(t('updated'));
                },
                onError: (e) => {
                  fail(failureText(e));
                },
              },
            );
          } else {
            create.mutate(
              { ...body, parentId: mode.parent?.id ?? null },
              {
                onSuccess: () => {
                  done(t('created'));
                },
                onError: (e) => {
                  fail(failureText(e));
                },
              },
            );
          }
        }}
      />
    );

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6 lg:py-12">
      <PageHeader
        eyebrow={tCatalog('eyebrow')}
        title={t('category.title')}
        description={t('category.description')}
        action={
          mode === undefined ? (
            <Button
              disabled={!categories.isSuccess}
              onClick={() => {
                open({ kind: 'create', parent: null });
              }}
            >
              {t('category.create_open')}
            </Button>
          ) : undefined
        }
      />
      {editor}
      <StatusLine error={error} saved={saved !== undefined} savedText={saved ?? ''} />
      {categories.isPending && (
        <p role="status" className="text-sm text-slate-500">
          {tCatalog('loading')}
        </p>
      )}
      {categories.isError &&
        (errorCodeOf(categories.error) === 'INTERNAL_ERROR' ? (
          <LoadFailed onRetry={() => void categories.refetch()} />
        ) : (
          <p role="alert">{tErrors(errorCodeOf(categories.error))}</p>
        ))}
      {categories.isSuccess && (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-200/80 px-6 py-4">
            <h2 className="text-base font-semibold text-slate-900">{t('category.list_title')}</h2>
            <span className="text-xs font-medium text-slate-500 tabular-nums">
              {t('category.summary', { total: tree.length, active: activeCount })}
            </span>
          </div>
          {tree.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-slate-500">{t('category.empty')}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {tree.map((item) => {
                const dimmed = !item.isActive || item.parentInactive;
                return (
                  <li
                    key={item.id}
                    data-testid="category-row"
                    data-depth={item.depth}
                    className={`group px-6 py-3.5 transition-colors duration-200 hover:bg-slate-50/70 ${item.depth === 1 ? 'bg-white' : ''}`}
                  >
                    <div
                      className={`flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between ${INDENT[item.depth - 1] ?? ''}`}
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <span
                          aria-hidden="true"
                          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ring-4 ${
                            item.depth === 1
                              ? 'bg-indigo-500 ring-indigo-100'
                              : item.depth === 2
                                ? 'bg-violet-400 ring-violet-100'
                                : 'bg-slate-300 ring-slate-100'
                          } ${dimmed ? 'opacity-40' : ''}`}
                        />
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`text-sm break-words ${item.depth === 1 ? 'font-semibold' : 'font-medium'} ${dimmed ? 'text-slate-400' : 'text-slate-900'}`}
                            >
                              {label(item)}
                            </span>
                            <Badge tone={item.isActive ? 'emerald' : 'slate'}>
                              {item.isActive ? t('active') : t('inactive')}
                            </Badge>
                            {item.parentInactive && (
                              <Badge tone="amber">{t('category.parent_inactive')}</Badge>
                            )}
                          </div>
                          <p className="text-xs text-slate-500">
                            {t('category.level', { depth: item.depth })}
                            <span className="mx-2 text-slate-300">·</span>
                            {t('sort_value', { value: item.sortOrder })}
                            {item.childCount > 0 && (
                              <>
                                <span className="mx-2 text-slate-300">·</span>
                                {t('category.children', { count: item.childCount })}
                              </>
                            )}
                          </p>
                        </div>
                      </div>
                      {mode === undefined && (
                        <div className="flex flex-wrap items-center gap-2 pl-5 lg:pl-0">
                          {item.canAddChild && (
                            <Button
                              variant="secondary"
                              onClick={() => {
                                open({ kind: 'create', parent: item });
                              }}
                            >
                              {t('category.add_child')}
                            </Button>
                          )}
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
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="border-t border-slate-200/80 px-6 py-3 text-xs text-slate-500">
            {t('category.no_delete_hint')}
          </p>
        </Card>
      )}
    </div>
  );
}
