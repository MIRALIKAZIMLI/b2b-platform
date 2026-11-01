'use client';
// Veri paylaşım metni v1 (NFR-63, `docs/legal/data-sharing-v1.md`): arayüz dilinde, maddeler
// numaralı. Metin çeviri anahtarlarındadır (`dataSharing.v1.*`), sürüm `@b2b/shared`'de.
import { DATA_SHARING_ITEM_COUNT } from '@b2b/shared';
import { useTranslations } from 'next-intl';

const ITEMS = Array.from({ length: DATA_SHARING_ITEM_COUNT }, (_, index) => index + 1);

export function ConsentText({ id }: { id: string }) {
  const t = useTranslations('dataSharing.v1');
  return (
    <div
      id={id}
      tabIndex={0}
      className="max-h-64 space-y-3 overflow-y-auto rounded-xl border border-slate-200/80 bg-white p-4 text-sm leading-relaxed text-slate-600 shadow-inner focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none"
    >
      <p className="font-semibold text-slate-900">{t('title')}</p>
      <ol className="space-y-2.5">
        {ITEMS.map((item) => (
          <li key={item} className="flex gap-2.5">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-[11px] font-semibold text-indigo-600 tabular-nums">
              {item}
            </span>
            <span>
              <span className="font-medium text-slate-900">{t(`item${String(item)}_title`)}</span>{' '}
              {t(`item${String(item)}_body`)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
