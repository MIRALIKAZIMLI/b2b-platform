'use client';
// Gelen bağlantı istekleri ve bloklananlar (F2.13b; US-023). UX kararları:
// - Başlık + iki sekme: "Gələn sorğular" (bekleyen sayısı rozetli) ve "Bloklananlar" (yalnız
//   `connections.block`).
// - Her istek bir kart: logo ya da baş harf, toptancı ünvanı, tanıtım (kullanıcı dili, 3 satır),
//   mesaj alıntı kutusunda, önerilen vade + son yanıt tarihi `tabular-nums`. Ürün/fiyat yok.
// - Eylemler kartın altında sağda: "Qəbul et" (ana), "Rədd et" (ikincil), "Blokla" (sessiz
//   tehlike). Her biri onay penceresi açar. İzin yoksa düğme hiç görünmez (satın alma sorumlusu).
// - Bloklananlar tek kart içinde satırlar; "Bloku götür" onaylı.
// - Boş durum, iskelet yükleme, hata + yeniden dene; aynı dil ve tasarım gönderilenler sayfasıyla.
import { incomingCardView, type IncomingCardView, initialsOf } from '@b2b/shared';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { ApiError } from '../admin-sellers/api';
import { Button, Card, PageHeader } from '../ui/primitives';
import { type ConfirmAction, useBlocks, useIncomingRequests } from './api';
import { ConfirmDialog } from './confirm-dialog';
import { useConnectionContext } from './context';

type Tab = 'incoming' | 'blocked';

interface Pending {
  readonly action: ConfirmAction;
  readonly targetId: string;
  readonly name: string;
}

function Avatar({ initials, logoUrl }: { initials: string; logoUrl: string | null }) {
  return logoUrl === null ? (
    <div
      aria-hidden="true"
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-100 text-sm font-semibold text-indigo-700 ring-1 ring-indigo-500/10"
    >
      {initials}
    </div>
  ) : (
    <img
      src={logoUrl}
      alt=""
      className="h-12 w-12 shrink-0 rounded-2xl object-cover ring-1 ring-slate-200/80"
    />
  );
}

function IncomingCard({
  view,
  onAction,
}: {
  view: IncomingCardView;
  onAction: (pending: Pending) => void;
}) {
  const t = useTranslations('connections.incoming');
  const { formatDay, access } = useConnectionContext();
  const open = (action: ConfirmAction, targetId: string) => {
    onAction({ action, targetId, name: view.sellerName });
  };
  return (
    <Card className="p-6 transition-shadow duration-200 hover:shadow-md sm:p-7">
      <article className="space-y-5" aria-labelledby={`incoming-${view.id}`}>
        <div className="flex items-start gap-4">
          <Avatar initials={view.initials} logoUrl={view.logoUrl} />
          <div className="min-w-0 flex-1 space-y-1.5">
            <h2
              id={`incoming-${view.id}`}
              className="truncate text-base font-semibold text-slate-900"
            >
              {view.sellerName}
            </h2>
            {view.description === null ? (
              <p className="text-sm text-slate-400 italic">{t('no_description')}</p>
            ) : (
              <p className="line-clamp-3 max-w-2xl text-sm break-words text-slate-600">
                {view.description}
              </p>
            )}
          </div>
        </div>
        {view.message !== null && (
          <figure className="rounded-2xl border border-slate-200/70 bg-slate-50/70 px-4 py-3">
            <figcaption className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
              {t('message')}
            </figcaption>
            <blockquote className="mt-1 text-sm break-words whitespace-pre-line text-slate-700">
              {view.message}
            </blockquote>
          </figure>
        )}
        <div className="flex flex-col gap-4 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-500 tabular-nums">
            <div className="flex gap-1.5">
              <dt>{t('term')}</dt>
              <dd className="font-medium text-slate-800">
                {view.termDays === null ? t('term_none') : t('term_days', { days: view.termDays })}
              </dd>
            </div>
            {view.expiresAt !== null && (
              <div className="flex gap-1.5">
                <dt>{t('expires')}</dt>
                <dd className="font-medium text-slate-800">{formatDay(view.expiresAt)}</dd>
              </div>
            )}
          </dl>
          {(access.respond || access.block) && (
            <div className="flex flex-col-reverse gap-2 sm:shrink-0 sm:flex-row sm:items-center [&>button]:whitespace-nowrap">
              {access.block && (
                <Button
                  variant="quiet-danger"
                  onClick={() => {
                    open('block', view.sellerId);
                  }}
                >
                  {t('block')}
                </Button>
              )}
              {access.respond && (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      open('reject', view.id);
                    }}
                  >
                    {t('reject')}
                  </Button>
                  <Button
                    onClick={() => {
                      open('accept', view.id);
                    }}
                  >
                    {t('accept')}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </article>
    </Card>
  );
}

function SkeletonCards() {
  return (
    <div aria-hidden="true" className="space-y-4">
      {[0, 1].map((key) => (
        <Card key={key} className="flex gap-4 p-7">
          <div className="h-12 w-12 animate-pulse rounded-2xl bg-slate-200/80" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-48 animate-pulse rounded-full bg-slate-200/80" />
            <div className="h-3 w-72 max-w-full animate-pulse rounded-full bg-slate-100" />
          </div>
        </Card>
      ))}
    </div>
  );
}

function ErrorBox({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const t = useTranslations('connections');
  const tErrors = useTranslations('errors');
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50/70 p-5 text-sm text-rose-700 sm:flex-row sm:items-center sm:justify-between"
    >
      <span>{tErrors(error instanceof ApiError ? error.code : 'INTERNAL_ERROR')}</span>
      <Button variant="secondary" onClick={onRetry}>
        {t('outgoing.retry')}
      </Button>
    </div>
  );
}

function EmptyCard({ title, body }: { title: string; body: string }) {
  return (
    <Card className="flex flex-col items-start gap-2 bg-gradient-to-br from-white to-indigo-50/40 p-8">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <p className="max-w-xl text-sm text-slate-500">{body}</p>
    </Card>
  );
}

function IncomingList({ onAction }: { onAction: (pending: Pending) => void }) {
  const t = useTranslations('connections');
  const { shell, locale, access } = useConnectionContext();
  const list = useIncomingRequests(access.view ? shell.activeBusinessId : undefined);
  const views = useMemo(
    () =>
      (list.data?.pages.flatMap((page) => page.items) ?? []).map((item) =>
        incomingCardView(item, locale),
      ),
    [list.data, locale],
  );
  if (list.isError) return <ErrorBox error={list.error} onRetry={() => void list.refetch()} />;
  if (list.data === undefined) return <SkeletonCards />;
  if (views.length === 0) {
    return <EmptyCard title={t('incoming.empty_title')} body={t('incoming.empty')} />;
  }
  return (
    <div className="space-y-4">
      {views.map((view) => (
        <IncomingCard key={view.id} view={view} onAction={onAction} />
      ))}
      {list.hasNextPage && (
        <div className="flex justify-center pt-2">
          <Button
            variant="secondary"
            disabled={list.isFetchingNextPage}
            onClick={() => void list.fetchNextPage()}
          >
            {list.isFetchingNextPage ? t('outgoing.loading') : t('outgoing.more')}
          </Button>
        </div>
      )}
    </div>
  );
}

function BlockedList({ onAction }: { onAction: (pending: Pending) => void }) {
  const t = useTranslations('connections');
  const { shell, formatDay } = useConnectionContext();
  const blocks = useBlocks(shell.activeBusinessId);
  if (blocks.isError)
    return <ErrorBox error={blocks.error} onRetry={() => void blocks.refetch()} />;
  if (blocks.data === undefined) return <SkeletonCards />;
  if (blocks.data.items.length === 0) {
    return <EmptyCard title={t('blocked.empty_title')} body={t('blocked.empty')} />;
  }
  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-slate-100">
        {blocks.data.items.map((item) => (
          <li
            key={item.sellerId}
            className="flex flex-col gap-3 px-6 py-5 transition-colors duration-200 hover:bg-slate-50/70 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex min-w-0 items-center gap-4">
              <Avatar initials={initialsOf(item.sellerName)} logoUrl={item.logoUrl} />
              <div className="min-w-0 space-y-1">
                <p className="truncate text-base font-semibold text-slate-900">{item.sellerName}</p>
                <p className="text-sm text-slate-500 tabular-nums">
                  {t('blocked.since', { date: formatDay(item.createdAt) })}
                </p>
              </div>
            </div>
            <Button
              variant="secondary"
              className="shrink-0"
              onClick={() => {
                onAction({ action: 'unblock', targetId: item.sellerId, name: item.sellerName });
              }}
            >
              {t('blocked.unblock')}
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function IncomingRequestsPage() {
  const t = useTranslations('connections');
  const { shell, access } = useConnectionContext();
  const [tab, setTab] = useState<Tab>('incoming');
  const [pending, setPending] = useState<Pending | undefined>();

  if (shell.me !== undefined && !access.view) {
    return (
      <div className="space-y-8 px-4 py-8 sm:px-6 lg:py-10">
        <PageHeader title={t('incoming.title')} />
        <Card className="max-w-xl p-8">
          <p role="alert" className="text-sm text-slate-600">
            {t('outgoing.no_access')}
          </p>
        </Card>
      </div>
    );
  }

  const tabs: Tab[] = access.block ? ['incoming', 'blocked'] : ['incoming'];
  return (
    <div className="space-y-8 px-4 py-8 sm:px-6 lg:py-10">
      <PageHeader title={t('incoming.title')} description={t('incoming.description')} />
      {tabs.length > 1 && (
        <div
          role="tablist"
          aria-label={t('incoming.tabs_label')}
          className="flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/70 p-1 shadow-sm backdrop-blur sm:inline-flex"
        >
          {tabs.map((key) => {
            const active = key === tab;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setTab(key);
                }}
                className={`shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none ${
                  active
                    ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/20'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {t(`incoming.tab_${key}`)}
              </button>
            );
          })}
        </div>
      )}
      <div className="max-w-3xl">
        {tab === 'incoming' ? (
          <IncomingList onAction={setPending} />
        ) : (
          <BlockedList onAction={setPending} />
        )}
      </div>
      {pending !== undefined && (
        <ConfirmDialog
          action={pending.action}
          targetId={pending.targetId}
          name={pending.name}
          onClose={() => {
            setPending(undefined);
          }}
        />
      )}
    </div>
  );
}
