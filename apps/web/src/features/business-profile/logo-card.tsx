'use client';
// İşletme logosu (F2.10b, US-007 AC2 "logo" alanı; ADR-0024). UX kararları: profil sayfasının en
// üstünde yatay kart; solda 64 px yuvarlatılmış önizleme (yoksa baş harf), sağda kısa açıklama ve
// eylemler. Dosya seçilince hemen yüklenir (ayrı "Kaydet" yok); yüklenirken düğme "Yükleniyor…".
// Tür istemcide de denetlenir (PNG/JPEG/WebP); asıl doğrulama API'de (boyut + imza). Sonuç satırı
// Emerald, hata Rose. Görünürlüğü ayrı: "Görünürlük ayarları" kartındaki "Logo" anahtarı.
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import type { BusinessProfile } from '../buyer-registration/api';
import { Button, Card } from '../ui/primitives';
import { LOGO_CONTENT_TYPES, useSetLogo } from './api';

type Notice =
  { kind: 'ok'; key: 'saved' | 'removed' } | { kind: 'error'; key: 'invalid_type' | 'failed' };

export function LogoCard({
  businessId,
  profile,
}: {
  businessId: string | undefined;
  profile: BusinessProfile | undefined;
}) {
  const t = useTranslations('businessProfile.logo');
  const input = useRef<HTMLInputElement>(null);
  const setLogo = useSetLogo(businessId);
  const [notice, setNotice] = useState<Notice | undefined>();
  const logoUrl = profile?.logoUrl ?? null;
  const initial = (profile?.legalName ?? '').trim().charAt(0).toUpperCase();
  const busy = setLogo.isPending || profile === undefined;

  function submit(file: File | null) {
    setNotice(undefined);
    if (file !== null && !(LOGO_CONTENT_TYPES as readonly string[]).includes(file.type)) {
      setNotice({ kind: 'error', key: 'invalid_type' });
      return;
    }
    setLogo.mutate(file, {
      onSuccess: () => {
        setNotice({ kind: 'ok', key: file === null ? 'removed' : 'saved' });
      },
      onError: () => {
        setNotice({ kind: 'error', key: 'failed' });
      },
    });
  }

  return (
    <Card className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:p-8">
      <div
        data-testid="logo-preview"
        className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-slate-100 shadow-sm"
      >
        {logoUrl === null ? (
          <span aria-label={t('empty')} className="text-xl font-semibold text-slate-400">
            {initial === '' ? '—' : initial}
          </span>
        ) : (
          // Dış depo adresi (CDN veya imzalı); Next Image yapılandırması gerektirmez.
          <img src={logoUrl} alt={t('alt')} className="h-full w-full object-cover" />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <h2 className="text-base font-semibold text-slate-900">{t('title')}</h2>
        <p className="text-sm text-slate-500">{t('description')}</p>
        {notice !== undefined && (
          <p
            role={notice.kind === 'ok' ? 'status' : 'alert'}
            className={`text-sm font-medium ${notice.kind === 'ok' ? 'text-emerald-600' : 'text-rose-600'}`}
          >
            {notice.kind === 'ok' ? '✓ ' : ''}
            {t(notice.key)}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          ref={input}
          type="file"
          accept={LOGO_CONTENT_TYPES.join(',')}
          className="sr-only"
          data-testid="logo-input"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            event.target.value = '';
            if (file !== null) submit(file);
          }}
        />
        <Button
          variant={logoUrl === null ? 'primary' : 'secondary'}
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {setLogo.isPending ? t('uploading') : logoUrl === null ? t('upload') : t('replace')}
        </Button>
        {logoUrl !== null && (
          <Button
            variant="quiet-danger"
            disabled={busy}
            onClick={() => {
              submit(null);
            }}
          >
            {t('remove')}
          </Button>
        )}
      </div>
    </Card>
  );
}
