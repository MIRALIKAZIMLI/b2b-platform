'use client';
// Dizin sonucu kartı (F2.11b). Yalnız dolu (perakendecinin açtığı) alanlar satır olarak görünür;
// kapalı alanlar hiç yer kaplamaz, kapalı alan varsa altta tek ince not. Kod alanları (telefon,
// VÖEN) `tabular-nums`. Logo yoksa ünvanın baş harfleriyle Indigo→Violet rozet.
import { pickLocalizedText } from '@b2b/shared';
import { useLocale, useTranslations } from 'next-intl';
import { Badge, Card } from '../ui/primitives';
import type { DirectoryBuyer } from './api';

const CONTACT_FIELDS = [
  'businessPhone',
  'personalPhone',
  'email',
  'voen',
  'contactName',
  'addressLine',
] as const;
type ContactField = (typeof CONTACT_FIELDS)[number];
const CODE_FIELDS: ReadonlySet<ContactField> = new Set(['businessPhone', 'personalPhone', 'voen']);

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((part) => part !== '')
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase())
    .join('');
}

export function BuyerCard({ buyer }: { buyer: DirectoryBuyer }) {
  const t = useTranslations('directory');
  const locale = useLocale();
  const region = pickLocalizedText(buyer.region, locale) ?? '';
  const activity = pickLocalizedText(buyer.activityType, locale) ?? '';
  const open = CONTACT_FIELDS.filter((field) => buyer[field] !== null);
  const hasHidden = open.length < CONTACT_FIELDS.length || buyer.logoUrl === null;

  return (
    <Card className="flex flex-col gap-5 p-6">
      <div className="flex items-start gap-4">
        {buyer.logoUrl !== null ? (
          <img
            src={buyer.logoUrl}
            alt=""
            className="h-12 w-12 shrink-0 rounded-xl border border-slate-200/80 bg-white object-cover shadow-sm"
          />
        ) : (
          <div
            aria-hidden="true"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-semibold text-white shadow-md shadow-indigo-500/20"
          >
            {initials(buyer.legalName)}
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold text-slate-900">{buyer.legalName}</h3>
            {buyer.verified && <Badge tone="emerald">{t('verified')}</Badge>}
          </div>
          <p className="text-sm text-slate-500">
            {region} · {activity}
          </p>
        </div>
      </div>

      {open.length > 0 && (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
          {open.map((field) => (
            <div key={field} className="min-w-0 space-y-0.5">
              <dt className="text-xs font-medium text-slate-500">{t(`field.${field}`)}</dt>
              <dd
                className={`text-sm break-words text-slate-900 ${CODE_FIELDS.has(field) ? 'tracking-wide tabular-nums' : ''}`}
              >
                {buyer[field]}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {hasHidden && <p className="text-xs text-slate-400">{t('hidden_fields')}</p>}
    </Card>
  );
}
