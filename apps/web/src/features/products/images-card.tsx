'use client';
// Ürün görselleri kartı (F3.4b, US-030 AC3; F3.4a K1–K10). UX kararları:
// - Formun "Əsas" kartının hemen altında; yeni üründe yalnız "önce kaydedin" notu (görsel kayıtlı
//   ürüne bağlanır).
// - Kare kutucuklu ızgara (mobilde 2, geniş ekranda 4 sütun), rounded-2xl, ince kenarlık. İlk görsel
//   "Örtük" rozetini taşır. İşlenen görsel nabız animasyonlu "Hazırlanır…", başarısız görsel Rose.
// - Dosya seçilince hemen yüklenir (birden çok dosya sırayla); ayrı "Kaydet" yok, form alanlarını
//   etkilemez. Kutucuk altında: Örtük et, ← →, Sil. Arşivli ürün / izinsiz üye: yalnız görüntü.
// - Tür istemcide de denetlenir; boyut, sınır (8) ve imza API'de. Hata Rose, sonuç Emerald.
import { useTranslations } from 'next-intl';
import { type ButtonHTMLAttributes, useId, useRef, useState } from 'react';
import { ApiError } from '../admin-sellers/api';
import { Card } from '../ui/primitives';
import { PRODUCT_IMAGE_CONTENT_TYPES, type ProductImage, useProductImages } from './api';

type Notice =
  | { kind: 'ok'; key: 'uploaded' | 'removed' | 'reordered' }
  | { kind: 'error'; key: 'type' | 'size' | 'limit' | 'failed' };

/** API hatasından kullanıcı mesajı anahtarı (F1.10 `FILE_INVALID`, F3.4a 422 `fileId`). */
export function imageErrorKey(error: unknown): 'type' | 'size' | 'limit' | 'failed' {
  if (!(error instanceof ApiError)) return 'failed';
  const details = (error.details ?? {}) as Record<string, unknown>;
  if (error.code === 'FILE_INVALID') {
    if (details.reason === 'size') return 'size';
    if (details.reason === 'content_type' || details.reason === 'signature') return 'type';
    return 'failed';
  }
  if (error.code === 'VALIDATION_FAILED') {
    const reasons = details.fileId;
    if (Array.isArray(reasons) && reasons.includes('limit')) return 'limit';
  }
  return 'failed';
}

/** `index`teki görseli `to` konumuna taşır; yeni kimlik sırası. */
export function movedOrder(images: readonly ProductImage[], index: number, to: number): string[] {
  const ids = images.map((image) => image.id);
  const [moved] = ids.splice(index, 1);
  if (moved === undefined) return ids;
  ids.splice(Math.max(0, Math.min(to, ids.length)), 0, moved);
  return ids;
}

export function ImagesCard({
  businessId,
  productId,
  images,
  readOnly,
}: {
  businessId: string | undefined;
  productId: string | undefined;
  images: readonly ProductImage[];
  readOnly: boolean;
}) {
  const t = useTranslations('products.images');
  const titleId = useId();

  return (
    <section aria-labelledby={titleId} data-testid="product-images">
      <Card className="space-y-5 p-6 sm:p-8">
        <div className="space-y-1">
          <h2 id={titleId} className="text-base font-semibold text-slate-900">
            {t('title')}
          </h2>
          <p className="text-sm text-slate-500">{t('description')}</p>
        </div>
        {productId === undefined ? (
          <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-sm text-slate-500">
            {t('save_first')}
          </p>
        ) : (
          <ImageGrid
            businessId={businessId}
            productId={productId}
            images={images}
            readOnly={readOnly}
          />
        )}
      </Card>
    </section>
  );
}

/** Kutucuk altındaki küçük eylem düğmesi (dokunma alanı ≥ 32 px). */
function TileButton({
  danger = false,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex min-h-8 min-w-8 items-center justify-center rounded-lg px-2 text-xs font-semibold transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 ${
        danger
          ? 'text-slate-500 hover:bg-rose-50 hover:text-rose-700'
          : 'text-slate-600 hover:bg-slate-100 hover:text-indigo-700'
      } ${className ?? ''}`}
    />
  );
}

function ImageGrid({
  businessId,
  productId,
  images,
  readOnly,
}: {
  businessId: string | undefined;
  productId: string;
  images: readonly ProductImage[];
  readOnly: boolean;
}) {
  const t = useTranslations('products.images');
  const input = useRef<HTMLInputElement>(null);
  const { upload, reorder, remove } = useProductImages(businessId, productId);
  const [notice, setNotice] = useState<Notice | undefined>();
  const [uploading, setUploading] = useState(false);
  const busy = uploading || reorder.isPending || remove.isPending;

  async function uploadAll(files: File[]) {
    setNotice(undefined);
    if (
      files.some((file) => !(PRODUCT_IMAGE_CONTENT_TYPES as readonly string[]).includes(file.type))
    ) {
      setNotice({ kind: 'error', key: 'type' });
      return;
    }
    setUploading(true);
    try {
      for (const file of files) await upload.mutateAsync(file);
      setNotice({ kind: 'ok', key: 'uploaded' });
    } catch (error) {
      setNotice({ kind: 'error', key: imageErrorKey(error) });
    } finally {
      setUploading(false);
    }
  }

  function order(index: number, to: number) {
    setNotice(undefined);
    reorder.mutate(movedOrder(images, index, to), {
      onSuccess: () => {
        setNotice({ kind: 'ok', key: 'reordered' });
      },
      onError: () => {
        setNotice({ kind: 'error', key: 'failed' });
      },
    });
  }

  function drop(imageId: string) {
    setNotice(undefined);
    remove.mutate(imageId, {
      onSuccess: () => {
        setNotice({ kind: 'ok', key: 'removed' });
      },
      onError: () => {
        setNotice({ kind: 'error', key: 'failed' });
      },
    });
  }

  return (
    <div className="space-y-4">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {images.map((image, index) => (
          <li
            key={image.id}
            className="space-y-2"
            data-testid="product-image"
            data-status={image.status}
          >
            <div className="relative aspect-square overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-50 shadow-sm">
              {image.status === 'ready' && image.urls !== null ? (
                // Dış depo adresi (CDN veya imzalı); Next Image yapılandırması gerektirmez.
                <img
                  src={image.urls.medium}
                  alt={t('alt', { position: index + 1 })}
                  className="h-full w-full object-cover"
                />
              ) : image.status === 'processing' ? (
                <div className="flex h-full w-full animate-pulse items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 px-2 text-center text-xs font-medium text-slate-500">
                  {t('processing')}
                </div>
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-rose-50 px-2 text-center text-xs font-medium text-rose-700">
                  {t('failed')}
                </div>
              )}
              {index === 0 && (
                <span className="absolute top-2 left-2 rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm">
                  {t('cover')}
                </span>
              )}
            </div>
            {!readOnly && (
              <div className="flex flex-wrap items-center gap-1">
                {index > 0 && (
                  <TileButton
                    disabled={busy}
                    onClick={() => {
                      order(index, 0);
                    }}
                  >
                    {t('make_cover')}
                  </TileButton>
                )}
                <TileButton
                  disabled={busy || index === 0}
                  aria-label={t('move_left', { position: index + 1 })}
                  onClick={() => {
                    order(index, index - 1);
                  }}
                >
                  ←
                </TileButton>
                <TileButton
                  disabled={busy || index === images.length - 1}
                  aria-label={t('move_right', { position: index + 1 })}
                  onClick={() => {
                    order(index, index + 1);
                  }}
                >
                  →
                </TileButton>
                <TileButton
                  danger
                  disabled={busy}
                  aria-label={t('remove_label', { position: index + 1 })}
                  onClick={() => {
                    drop(image.id);
                  }}
                >
                  {t('remove')}
                </TileButton>
              </div>
            )}
          </li>
        ))}
        {!readOnly && (
          <li>
            <button
              type="button"
              disabled={busy}
              onClick={() => input.current?.click()}
              className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-slate-300 bg-white text-sm font-medium text-slate-600 transition-colors duration-200 hover:border-indigo-400 hover:bg-indigo-50/40 hover:text-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span aria-hidden="true" className="text-2xl leading-none">
                +
              </span>
              {uploading ? t('uploading') : t('add')}
            </button>
          </li>
        )}
      </ul>
      {images.length === 0 && readOnly && <p className="text-sm text-slate-500">{t('empty')}</p>}
      <input
        ref={input}
        type="file"
        multiple
        accept={PRODUCT_IMAGE_CONTENT_TYPES.join(',')}
        className="sr-only"
        data-testid="product-image-input"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          if (files.length > 0) void uploadAll(files);
        }}
      />
      {notice !== undefined && (
        <p
          role={notice.kind === 'ok' ? 'status' : 'alert'}
          className={`text-sm font-medium ${notice.kind === 'ok' ? 'text-emerald-600' : 'text-rose-600'}`}
        >
          {notice.kind === 'ok' ? '✓ ' : ''}
          {notice.kind === 'ok' ? t(`notice.${notice.key}`) : t(`error.${notice.key}`)}
        </p>
      )}
    </div>
  );
}
