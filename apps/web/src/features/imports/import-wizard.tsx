'use client';
// Excel ürün içe aktarma sihirbazı (F3.5b, US-031 AC1–AC3; SF-08). UX kararları:
// - Ürünler sayfasındaki "Excel ilə idxal" düğmesinden açılır (`imports.run`); izinsiz üye yalnız
//   bilgi kartı görür. Üstte 4 adımlı ilerleme şeridi: Fayl · Yoxlama · Təsdiq · Nəticə.
// - İş kimliği adreste (`?job=`): sayfa yenilense de önizleme kaybolmaz (24 saat saklanır).
// - Yükleme: şablon indirme + kesik çizgili bırakma alanı (tek .xlsx). Seçilince hemen yüklenir.
// - Yoxlama/tətbiq: worker'ı 2 sn aralıkla izler; tətbiqdə satır ilerleme çubuğu (Müfettiş 29 not 1).
// - Önizleme: dört sayı kutusu (Indigo eklenecek, Slate güncellenecek, Rose hatalı, Amber uyarılı),
//   iş notları, ilk sorunlu satırlar tablosu (tamamı raporda), rapor indirme, son geçerlilik zamanı,
//   ileri tarihli fiyat bilgisi (not 3). "Təsdiqlə" yalnız uygulanacak satır varsa; 403 gelirse
//   düğme kalkar ve neden yazılır (S1 = A: yalnız yükleyen onaylar).
// - Sonuç: Emerald başlık + gerçek sayılar + sonuç raporu; başarısız işte neden ve kısmi uygulamada
//   uygulanan satır sayısı; aynı dosya yeniden yüklenebilir (SKU ile güncelleme tekrarlanabilir).
// F3.7b (US-035 AC2, S2 = A): `pricing.manage` ile yükleme adımında tür seçimi "Məhsullar /
//   Müştəri qiymətləri". Müşteri fiyatında aktif müşteri seçilmeden şablon ve yükleme kapalı; şablon
//   o müşteriye hazır iner. Önizleme kutuları "yeni / dəyişən / xətalı / dəyişməyən" diye adlanır;
//   sonuçta müşterinin "Xüsusi qiymətlər" sayfasına bağlantı. #85 notları: "Təsdiqlə" sunucunun
//   `canApply`'ına göre baştan gizlenir (neden yazılır); iş ilk yüklemede geçici hatayla gelmezse
//   "süresi doldu" değil "yeniden dene" görünür (yalnız 404 süresi doldu).
import {
  formatDateTime,
  IMPORT_NOTES,
  IMPORT_ROW_ERROR_CODES,
  IMPORT_ROW_WARNING_CODES,
  type ImportJobStatus,
  pricingAccess,
} from '@b2b/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { type ReactNode, useId, useRef, useState } from 'react';
import { DEFAULT_TIMEZONE } from '../admin-sellers/form';
import { useConnections } from '../customers/api';
import { useShell } from '../shell/use-shell';
import { Badge, Button, Card, PageHeader, SelectInput } from '../ui/primitives';
import {
  type ImportJob,
  type ImportKind,
  type ImportTarget,
  useImportJob,
  useImportMutations,
} from './api';
import {
  type ApplyErrorKey,
  applyErrorKey,
  applyProgress,
  appliedRowsOfFailed,
  confirmState,
  isXlsxFile,
  jobLoadErrorKey,
  sameOriginUrl,
  stepOf,
  type UploadErrorKey,
  uploadErrorKey,
  WIZARD_STEPS,
} from './wizard-state';

const KNOWN_ROW_CODES = new Set<string>([...IMPORT_ROW_ERROR_CODES, ...IMPORT_ROW_WARNING_CODES]);
const WARNING_CODES = new Set<string>(IMPORT_ROW_WARNING_CODES);
const KNOWN_NOTES = new Set<string>(IMPORT_NOTES);

function useFormatDateTime(): (iso: string) => string {
  const me = useShell().me;
  const locale = useLocale();
  return (iso: string) =>
    formatDateTime(iso, locale, {
      user: me?.timezone ?? null,
      business: null,
      country: DEFAULT_TIMEZONE,
    });
}

const linkClass =
  'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none';
const secondaryLink = `${linkClass} border border-slate-200/80 bg-white text-slate-700 shadow-sm hover:border-slate-300 hover:shadow-md`;

export function ImportWizard({
  initialJobId,
  initialType = 'products',
  initialBuyerId,
}: {
  initialJobId: string | undefined;
  initialType?: ImportKind;
  initialBuyerId?: string | undefined;
}) {
  const t = useTranslations('imports.wizard');
  const locale = useLocale();
  const router = useRouter();
  const shell = useShell();
  const businessId = shell.activeBusinessId;
  const codes = (shell.me?.activeBusiness?.permissions ?? []).map((p) => p.code);
  const canRun = codes.includes('imports.run');
  // Müşteri fiyatı işi `pricing.manage` ister (yoksa 403); müşteri listesi `connections.view`.
  const canPrices = pricingAccess(codes).manage && codes.includes('connections.view');
  const [target, setTarget] = useState<ImportTarget>({
    type: initialType,
    buyerId: initialBuyerId,
  });
  const effectiveTarget: ImportTarget = canPrices ? target : { type: 'products' };
  const [jobId, setJobId] = useState<string | undefined>(initialJobId);
  const job = useImportJob(businessId, jobId);
  const basePath = `/${locale}/seller/products/import`;

  function openJob(id: string | undefined) {
    setJobId(id);
    router.replace(id === undefined ? basePath : `${basePath}?job=${id}`);
  }

  const current = job.data;
  const step = jobId === undefined ? 'upload' : stepOf(current?.status);

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-8 sm:px-6 lg:py-12">
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description')}
        action={
          <Link href={`/${locale}/seller/products`} className={secondaryLink}>
            {t('back_to_products')}
          </Link>
        }
      />
      {shell.me !== undefined && !canRun ? (
        <Card className="p-8 text-center text-sm text-slate-600">{t('no_access')}</Card>
      ) : (
        <>
          <Stepper current={step} />
          {jobId === undefined ? (
            <UploadStep
              businessId={businessId}
              target={effectiveTarget}
              canPrices={canPrices}
              onTarget={setTarget}
              onStarted={(created) => {
                openJob(created.id);
              }}
            />
          ) : job.isPending ? (
            <Card className="h-48 animate-pulse bg-slate-100/60">
              <span className="sr-only">{t('loading')}</span>
            </Card>
          ) : current === undefined && jobLoadErrorKey(job.error) === 'retry' ? (
            <Notice
              tone="rose"
              title={t('load_failed_title')}
              action={
                <Button
                  onClick={() => {
                    void job.refetch();
                  }}
                >
                  {t('retry')}
                </Button>
              }
            >
              {t('load_failed_body')}
            </Notice>
          ) : current === undefined ? (
            <Notice
              tone="rose"
              title={t('missing_title')}
              action={
                <Button
                  onClick={() => {
                    openJob(undefined);
                  }}
                >
                  {t('start_over')}
                </Button>
              }
            >
              {t('missing_body')}
            </Notice>
          ) : (
            <JobView
              job={current}
              businessId={businessId}
              onRestart={() => {
                openJob(undefined);
              }}
              onRefresh={() => void job.refetch()}
            />
          )}
        </>
      )}
    </div>
  );
}

function Stepper({ current }: { current: ReturnType<typeof stepOf> }) {
  const t = useTranslations('imports.wizard');
  const index = WIZARD_STEPS.indexOf(current);
  return (
    <ol
      aria-label={t('steps_label')}
      className="grid grid-cols-4 gap-2 rounded-2xl border border-slate-200/80 bg-white/80 p-2 shadow-sm"
    >
      {WIZARD_STEPS.map((key, i) => {
        const state = i < index ? 'done' : i === index ? 'current' : 'next';
        return (
          <li
            key={key}
            aria-current={state === 'current' ? 'step' : undefined}
            data-testid={`import-step-${key}`}
            data-state={state}
            className={`flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-center sm:flex-row sm:justify-center sm:gap-2 ${
              state === 'current' ? 'bg-indigo-50/80 ring-1 ring-indigo-200' : ''
            }`}
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                state === 'done'
                  ? 'bg-emerald-500 text-white'
                  : state === 'current'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-500'
              }`}
            >
              {state === 'done' ? '✓' : i + 1}
            </span>
            <span
              className={`text-xs font-medium sm:text-sm ${
                state === 'next' ? 'text-slate-400' : 'text-slate-900'
              }`}
            >
              {t(`step.${key}`)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Notice({
  tone,
  title,
  children,
  action,
}: {
  tone: 'rose' | 'emerald' | 'indigo';
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const tones = {
    rose: 'border-rose-200/80 bg-rose-50/60',
    emerald: 'border-emerald-200/80 bg-emerald-50/60',
    indigo: 'border-indigo-200/80 bg-indigo-50/50',
  } as const;
  const titles = { rose: 'text-rose-800', emerald: 'text-emerald-800', indigo: 'text-indigo-900' };
  return (
    <div
      role={tone === 'rose' ? 'alert' : 'status'}
      className={`space-y-3 rounded-2xl border p-6 shadow-sm ${tones[tone]}`}
    >
      <p className={`text-base font-semibold ${titles[tone]}`}>{title}</p>
      {children !== undefined && <div className="text-sm text-slate-600">{children}</div>}
      {action !== undefined && <div className="flex flex-wrap gap-3 pt-1">{action}</div>}
    </div>
  );
}

function UploadStep({
  businessId,
  target,
  canPrices,
  onTarget,
  onStarted,
}: {
  businessId: string | undefined;
  target: ImportTarget;
  canPrices: boolean;
  onTarget: (target: ImportTarget) => void;
  onStarted: (job: ImportJob) => void;
}) {
  const t = useTranslations('imports.wizard');
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const { template, start } = useImportMutations(businessId);
  const [error, setError] = useState<UploadErrorKey | 'template' | undefined>();
  const [dragging, setDragging] = useState(false);
  const needsBuyer = target.type === 'customer_prices' && target.buyerId === undefined;

  function upload(file: File | undefined) {
    setError(undefined);
    if (file === undefined || needsBuyer) return;
    if (!isXlsxFile(file)) {
      setError('type');
      return;
    }
    start.mutate(
      { file, target },
      {
        onSuccess: onStarted,
        onError: (e) => {
          setError(uploadErrorKey(e));
        },
      },
    );
  }

  function downloadTemplate() {
    setError(undefined);
    template.mutate(target, {
      onSuccess: (url) => {
        window.location.assign(sameOriginUrl(url, window.location.origin));
      },
      onError: () => {
        setError('template');
      },
    });
  }

  const customer = target.type === 'customer_prices';
  return (
    <Card className="space-y-6 p-6 sm:p-8">
      {canPrices && <TargetPicker businessId={businessId} target={target} onTarget={onTarget} />}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-slate-50/60 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-900">{t('template_title')}</p>
          <p className="text-sm text-slate-500">
            {customer ? t('template_hint_customer') : t('template_hint')}
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={downloadTemplate}
          disabled={template.isPending || needsBuyer}
          data-testid="import-template"
        >
          {template.isPending ? t('template_loading') : t('template_download')}
        </Button>
      </div>

      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => {
          setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          upload(e.dataTransfer.files[0]);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-all duration-200 ${
          dragging
            ? 'border-indigo-400 bg-indigo-50/60'
            : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/30'
        } ${start.isPending || needsBuyer ? 'pointer-events-none opacity-60' : ''}`}
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-lg text-indigo-600 ring-1 ring-indigo-100">
          ↑
        </span>
        <span className="text-sm font-semibold text-slate-900">
          {start.isPending ? t('uploading') : t('drop_title')}
        </span>
        <span className="text-xs text-slate-500">{t('drop_hint')}</span>
        <input
          ref={input}
          id={inputId}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          data-testid="import-file-input"
          disabled={start.isPending || needsBuyer}
          onChange={(e) => {
            upload(e.target.files?.[0]);
            if (input.current !== null) input.current.value = '';
          }}
        />
      </label>
      {error !== undefined && (
        <p role="alert" className="text-sm font-medium text-rose-600">
          {t(`upload_error.${error}`)}
        </p>
      )}
    </Card>
  );
}

/** F3.7b: tür seçimi ve müşteri fiyatında müşteri (aktif bağlantılar). */
function TargetPicker({
  businessId,
  target,
  onTarget,
}: {
  businessId: string | undefined;
  target: ImportTarget;
  onTarget: (target: ImportTarget) => void;
}) {
  const t = useTranslations('imports.wizard');
  const customer = target.type === 'customer_prices';
  const connections = useConnections(customer ? businessId : undefined, 'active');
  const customers = (connections.data?.pages ?? []).flatMap((page) => page.items);
  const kinds: readonly ImportKind[] = ['products', 'customer_prices'];
  return (
    <div className="space-y-4">
      <div
        role="radiogroup"
        aria-label={t('kind_label')}
        className="inline-flex max-w-full gap-1 rounded-2xl border border-slate-200/80 bg-white/70 p-1 shadow-sm"
      >
        {kinds.map((kind) => {
          const selected = target.type === kind;
          return (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={selected}
              data-testid={`import-kind-${kind}`}
              onClick={() => {
                onTarget(kind === 'products' ? { type: kind } : { type: kind, buyerId: undefined });
              }}
              className={`shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none ${
                selected
                  ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/20'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {t(`kind.${kind}`)}
            </button>
          );
        })}
      </div>
      {customer && (
        <div className="space-y-1.5">
          <label htmlFor="import-buyer" className="block text-sm font-medium text-slate-900">
            {t('buyer_label')}
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="w-full sm:max-w-sm">
              <SelectInput
                id="import-buyer"
                value={target.buyerId ?? ''}
                onChange={(event) => {
                  onTarget({
                    type: 'customer_prices',
                    buyerId: event.target.value === '' ? undefined : event.target.value,
                  });
                }}
              >
                <option value="">{t('buyer_choose')}</option>
                {target.buyerId !== undefined &&
                  !customers.some((item) => item.buyerId === target.buyerId) && (
                    <option value={target.buyerId}>{t('buyer_selected')}</option>
                  )}
                {customers.map((item) => (
                  <option key={item.id} value={item.buyerId}>
                    {item.counterpartyName ?? t('buyer_unnamed')}
                  </option>
                ))}
              </SelectInput>
            </div>
            {connections.hasNextPage && (
              <Button
                variant="secondary"
                disabled={connections.isFetchingNextPage}
                onClick={() => void connections.fetchNextPage()}
              >
                {t('buyer_more')}
              </Button>
            )}
          </div>
          <p className="text-xs text-slate-500">
            {connections.isSuccess && customers.length === 0 ? t('buyer_none') : t('buyer_hint')}
          </p>
        </div>
      )}
    </div>
  );
}

function JobView({
  job,
  businessId,
  onRestart,
  onRefresh,
}: {
  job: ImportJob;
  businessId: string | undefined;
  onRestart: () => void;
  onRefresh: () => void;
}) {
  const t = useTranslations('imports.wizard');
  const status: ImportJobStatus = job.status;
  const restart = <Button onClick={onRestart}>{t('start_over')}</Button>;

  if (status === 'uploaded' || status === 'validating') {
    return (
      <Working title={t('checking_title')} body={t('checking_body')} testId="import-checking" />
    );
  }
  if (status === 'preview_ready') {
    return (
      <Preview job={job} businessId={businessId} onRestart={onRestart} onRefresh={onRefresh} />
    );
  }
  if (status === 'applying') return <Applying job={job} />;
  if (status === 'done') return <Done job={job} onRestart={onRestart} />;
  return <Failed job={job} action={restart} />;
}

function Working({
  title,
  body,
  testId,
  children,
}: {
  title: string;
  body: string;
  testId: string;
  children?: ReactNode;
}) {
  return (
    <div data-testid={testId}>
      <Card className="space-y-5 p-6 sm:p-8">
        <div role="status" className="flex items-start gap-4">
          <span className="mt-1 h-3 w-3 shrink-0 animate-pulse rounded-full bg-indigo-500 shadow-[0_0_0_6px] shadow-indigo-500/15" />
          <div className="space-y-1">
            <p className="text-base font-semibold text-slate-900">{title}</p>
            <p className="text-sm text-slate-500">{body}</p>
          </div>
        </div>
        {children}
      </Card>
    </div>
  );
}

function StatTiles({ stats, type }: { stats: ImportJob['stats']; type: ImportJob['type'] }) {
  const t = useTranslations('imports.wizard');
  const prefix = type === 'customer_prices' ? 'stat_customer' : 'stat';
  const tiles = [
    { key: 'insert', value: stats.insert, tone: 'text-indigo-700', ring: 'ring-indigo-100' },
    { key: 'update', value: stats.update, tone: 'text-slate-900', ring: 'ring-slate-200/80' },
    { key: 'error', value: stats.error, tone: 'text-rose-700', ring: 'ring-rose-100' },
    { key: 'warning', value: stats.warning, tone: 'text-amber-700', ring: 'ring-amber-100' },
  ] as const;
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map((tile) => (
        <div
          key={tile.key}
          data-testid={`import-stat-${tile.key}`}
          className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ${tile.ring}`}
        >
          <dt className="text-xs font-medium text-slate-500">{t(`${prefix}.${tile.key}`)}</dt>
          <dd className={`mt-1 text-2xl font-semibold tracking-tight tabular-nums ${tile.tone}`}>
            {tile.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ReportLink({ url, label }: { url: string; label: string }) {
  return (
    <a href={sameOriginUrl(url, globalThis.location.origin)} download className={secondaryLink}>
      {label}
    </a>
  );
}

function Problems({ job }: { job: ImportJob }) {
  const t = useTranslations('imports');
  const tw = useTranslations('imports.wizard');
  if (job.problems.length === 0) return null;
  const shown = job.problems.length;
  const total = job.stats.error + job.stats.warning;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">{tw('problems_title')}</h2>
        {total > shown && (
          <p className="text-xs text-slate-500">{tw('problems_more', { shown, total })}</p>
        )}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200/80">
        <table
          className="min-w-full divide-y divide-slate-200/80 text-sm"
          data-testid="import-problems"
        >
          <thead className="bg-slate-50/80 text-left text-xs font-medium text-slate-500">
            <tr>
              <th scope="col" className="px-4 py-2.5">
                {tw('col_row')}
              </th>
              <th scope="col" className="px-4 py-2.5">
                SKU
              </th>
              <th scope="col" className="px-4 py-2.5">
                {tw('col_problem')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {job.problems.map((problem) => (
              <tr key={problem.row} className="align-top transition-colors hover:bg-slate-50/60">
                <td className="px-4 py-3 font-medium text-slate-900 tabular-nums">{problem.row}</td>
                <td className="px-4 py-3 font-mono text-xs break-all text-slate-600">
                  {problem.sku ?? '—'}
                </td>
                <td className="px-4 py-3">
                  <ul className="space-y-1.5">
                    {problem.issues.map((issue) => (
                      <li
                        key={`${issue.column}-${issue.code}`}
                        className="flex flex-wrap items-center gap-2"
                      >
                        <Badge tone={WARNING_CODES.has(issue.code) ? 'amber' : 'slate'}>
                          {issue.column}
                        </Badge>
                        <span
                          className={
                            WARNING_CODES.has(issue.code) ? 'text-amber-800' : 'text-rose-700'
                          }
                        >
                          {t(`row.${KNOWN_ROW_CODES.has(issue.code) ? issue.code : 'invalid'}`)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Preview({
  job,
  businessId,
  onRestart,
  onRefresh,
}: {
  job: ImportJob;
  businessId: string | undefined;
  onRestart: () => void;
  onRefresh: () => void;
}) {
  const t = useTranslations('imports');
  const tw = useTranslations('imports.wizard');
  const formatDateTime = useFormatDateTime();
  const { apply } = useImportMutations(businessId);
  const [error, setError] = useState<ApplyErrorKey | undefined>();
  const applicable = job.stats.insert + job.stats.update;
  const confirmable = confirmState(job);
  const blocked = error === 'not_allowed' || error === 'expired';
  const customer = job.type === 'customer_prices';

  function confirm() {
    setError(undefined);
    apply.mutate(job.id, {
      onError: (e) => {
        const key = applyErrorKey(e);
        setError(key);
        if (key === 'moved') onRefresh();
      },
    });
  }

  return (
    <Card className="space-y-6 p-6 sm:p-8">
      <div className="space-y-1" data-testid="import-preview">
        <h2 className="text-base font-semibold text-slate-900">{tw('preview_title')}</h2>
        <p className="text-sm text-slate-500">
          {applicable > 0 ? tw('preview_body') : tw('preview_nothing')}
        </p>
      </div>
      <StatTiles stats={job.stats} type={job.type} />
      {job.notes.length > 0 && (
        <ul className="space-y-1 rounded-2xl bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
          {job.notes
            .filter((note) => KNOWN_NOTES.has(note))
            .map((note) => (
              <li key={note}>{t(`note.${note}`)}</li>
            ))}
        </ul>
      )}
      <Problems job={job} />
      <p className="text-xs text-slate-500">
        {customer ? tw('customer_price_hint') : tw('future_price_hint')}
      </p>
      {job.expiresAt !== null && (
        <p className="text-xs text-slate-500">
          {tw('expires_at', { at: formatDateTime(job.expiresAt) })}
        </p>
      )}
      {error !== undefined ? (
        <p role="alert" className="text-sm font-medium text-rose-600">
          {tw(`apply_error.${error}`)}
        </p>
      ) : (
        confirmable === 'not_allowed' && (
          <p className="text-sm font-medium text-slate-600" data-testid="import-not-allowed">
            {tw('apply_error.not_allowed')}
          </p>
        )
      )}
      <div className="flex flex-col-reverse gap-3 border-t border-slate-200/80 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={onRestart}>
            {tw('new_file')}
          </Button>
          {job.errorReportUrl !== null && (
            <ReportLink url={job.errorReportUrl} label={tw('download_problems')} />
          )}
        </div>
        {!blocked && confirmable === 'show' && (
          <Button onClick={confirm} disabled={apply.isPending}>
            {apply.isPending ? tw('applying_short') : tw('confirm', { count: applicable })}
          </Button>
        )}
      </div>
    </Card>
  );
}

function Applying({ job }: { job: ImportJob }) {
  const t = useTranslations('imports.wizard');
  const progress = applyProgress(job.appliedUntilRow, job.stats);
  return (
    <Working title={t('applying_title')} body={t('applying_body')} testId="import-applying">
      <div className="space-y-2">
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress.percent}
          aria-label={t('applying_title')}
          className="h-2 overflow-hidden rounded-full bg-slate-100"
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500"
            style={{ width: `${String(Math.max(progress.percent, 2))}%` }}
          />
        </div>
        <p className="text-xs text-slate-500 tabular-nums">
          {t('applying_rows', { done: progress.done, total: progress.total })}
        </p>
      </div>
    </Working>
  );
}

function Done({ job, onRestart }: { job: ImportJob; onRestart: () => void }) {
  const t = useTranslations('imports.wizard');
  const locale = useLocale();
  const customer = job.type === 'customer_prices' && job.buyerId !== null;
  return (
    <div className="space-y-6" data-testid="import-done">
      <Notice tone="emerald" title={t('done_title')}>
        {t('done_body', { applied: job.stats.insert + job.stats.update, skipped: job.stats.error })}
      </Notice>
      <Card className="space-y-6 p-6 sm:p-8">
        <StatTiles stats={job.stats} type={job.type} />
        <div className="flex flex-col gap-3 border-t border-slate-200/80 pt-6 sm:flex-row sm:flex-wrap">
          {job.resultReportUrl !== null && (
            <ReportLink url={job.resultReportUrl} label={t('download_result')} />
          )}
          {customer ? (
            <Link
              href={`/${locale}/seller/customers/${job.buyerId ?? ''}/prices`}
              className={secondaryLink}
            >
              {t('to_customer_prices')}
            </Link>
          ) : (
            <Link href={`/${locale}/seller/products`} className={secondaryLink}>
              {t('to_products')}
            </Link>
          )}
          <Button variant="secondary" onClick={onRestart}>
            {t('new_import')}
          </Button>
        </div>
        {!customer && <p className="text-xs text-slate-500">{t('done_draft_hint')}</p>}
      </Card>
    </div>
  );
}

function Failed({ job, action }: { job: ImportJob; action: ReactNode }) {
  const t = useTranslations('imports.wizard');
  const code = job.failureCode ?? 'APPLY_FAILED';
  const applied = appliedRowsOfFailed(job.appliedUntilRow);
  const partial = (code === 'APPLY_FAILED' || code === 'TIMED_OUT') && applied > 0;
  return (
    <div data-testid="import-failed" data-code={code}>
      <Notice tone="rose" title={t(`failure.${code}`)} action={action}>
        <p>{partial ? t('failed_partial', { applied }) : t('failed_none')}</p>
        {job.errorReportUrl !== null && (
          <p className="pt-3">
            <ReportLink url={job.errorReportUrl} label={t('download_problems')} />
          </p>
        )}
      </Notice>
    </div>
  );
}
