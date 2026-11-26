// Ürün görseli küçültme işi (F3.4a, US-030 AC3; R34; kart K2, K5, K11). Worker'da `catalog`
// kuyruğunda `product_image.added` olayıyla çalışır. Orijinal depodan okunur, `sharp` ile
// 200/800/1600 px WebP üretilir (EXIF yönü uygulanır, üst veri yazılmaz), depoya yazılır, satır
// `ready` olur. Çözülemeyen, piksel sınırını aşan veya desteklenmeyen görsel kalıcı hatadır: satır
// `failed`, yeniden deneme yok; ürün etkilenmez. Depo veya başka geçici hata (F3.4b, Müfettiş 27
// #79) satırı `processing` bırakır ve `catalog.image_retry_delays_minutes` beklemeleriyle yeniden
// denenir; liste bitince `failed`. Üç boyut sırayla üretilir (bellek tepesi tek çözümle sınırlı).
// Loga yalnız kimlik ve hata türü yazılır.
import { Inject, Injectable } from '@nestjs/common';
import { PRODUCT_IMAGE_SIZES, type ProductImageSize } from '@b2b/shared';
import sharp from 'sharp';
import { Clock } from '../../../core/clock';
import { withTenantTx } from '../../../core/db';
import { FileStorage } from '../../../core/ports/file-storage';
import { SettingsService } from '../../settings';
import { PRODUCT_IMAGE_SIZE_NAMES, renditionKey } from '../product-image-keys';
import { ProductImagesRepository } from '../product-images.repository';
import { CatalogJobs } from './catalog-jobs';

export const RESIZE_IMAGE_EVENT = 'product_image.added';

const ACCEPTED_FORMATS: ReadonlySet<string> = new Set(['jpeg', 'png', 'webp']);
const WEBP_QUALITY = 80;
const PIXELS_PER_MEGAPIXEL = 1_000_000;
const MINUTE_MS = 60_000;

/** Kalıcı görsel hatası (bozuk, desteklenmeyen tür, piksel sınırı). */
export class ImageRejectedError extends Error {
  constructor(readonly reason: 'format' | 'decode') {
    super(`image_rejected:${reason}`);
    this.name = 'ImageRejectedError';
  }
}

/**
 * Üç boyutu üretir (K2). Uzun kenar boyuta sığdırılır, küçük görsel büyütülmez. `maxPixels`
 * aşılırsa `sharp` çözmeden reddeder (bellek tüketimine karşı, R34).
 */
export async function resizeProductImage(
  body: Buffer,
  maxPixels: number,
): Promise<Record<ProductImageSize, Buffer>> {
  let source: sharp.Sharp;
  try {
    source = sharp(body, { limitInputPixels: maxPixels, failOn: 'error' });
    const meta = await source.metadata();
    if (!ACCEPTED_FORMATS.has(meta.format)) {
      throw new ImageRejectedError('format');
    }
    const oriented = source.rotate();
    // Sırayla: her boyut kaynağı yeniden çözer; paralel üretim bellek tepesini üçe katlar.
    const outputs: Partial<Record<ProductImageSize, Buffer>> = {};
    for (const size of PRODUCT_IMAGE_SIZE_NAMES) {
      outputs[size] = await oriented
        .clone()
        .resize(PRODUCT_IMAGE_SIZES[size], PRODUCT_IMAGE_SIZES[size], {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();
    }
    const { thumb, medium, large } = outputs;
    if (thumb === undefined || medium === undefined || large === undefined) {
      throw new ImageRejectedError('decode');
    }
    return { thumb, medium, large };
  } catch (error) {
    if (error instanceof ImageRejectedError) throw error;
    throw new ImageRejectedError('decode');
  }
}

export type ResizeOutcome = 'ready' | 'failed' | 'retry' | 'skipped';

export interface ResizeImageLog {
  warn(obj: Record<string, unknown>, msg: string): void;
}

@Injectable()
export class ResizeImageJob {
  constructor(
    @Inject(ProductImagesRepository)
    private readonly repository: Pick<ProductImagesRepository, 'findForJob' | 'finish'>,
    @Inject(FileStorage) private readonly storage: Pick<FileStorage, 'readRange' | 'put'>,
    @Inject(SettingsService) private readonly settings: Pick<SettingsService, 'get'>,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(CatalogJobs) private readonly jobs: Pick<CatalogJobs, 'addResizeRetry'>,
  ) {}

  /**
   * Satır yoksa veya artık `processing` değilse atlanır (tekrar gelen olay, silinen görsel).
   * `attempt`: önceki başarısız deneme sayısı (ilk çalışma 0).
   */
  async run(
    input: { readonly businessId: string; readonly imageId: string; readonly attempt?: number },
    log: ResizeImageLog,
  ): Promise<ResizeOutcome> {
    const attempt = input.attempt ?? 0;
    const ctx = { businessId: input.businessId, userId: null };
    const image = await withTenantTx(ctx, (tx) =>
      this.repository.findForJob(tx, input.businessId, input.imageId),
    );
    if (image?.status !== 'processing') return 'skipped';

    const megapixels = await this.settings.get('files.image_max_megapixels');
    let status: 'ready' | 'failed' = 'ready';
    try {
      const body = await this.storage.readRange(image.objectKey, image.sizeBytes);
      const outputs = await resizeProductImage(body, megapixels * PIXELS_PER_MEGAPIXEL);
      for (const size of PRODUCT_IMAGE_SIZE_NAMES) {
        await this.storage.put(renditionKey(image.objectKey, size), outputs[size], 'image/webp');
      }
    } catch (error) {
      if (
        !(error instanceof ImageRejectedError) &&
        (await this.scheduleRetry(input, attempt, log))
      ) {
        return 'retry';
      }
      status = 'failed';
      log.warn(
        {
          event: 'catalog.image_failed',
          imageId: image.id,
          attempt,
          reason: error instanceof ImageRejectedError ? error.reason : 'storage',
        },
        'ürün görseli işlenemedi',
      );
    }
    await withTenantTx(ctx, (tx) => this.repository.finish(tx, image.id, status, this.clock.now()));
    return status;
  }

  /** Geçici hata: sıradaki bekleme varsa yeniden deneme eklenir (`true`); yoksa `false`. */
  private async scheduleRetry(
    input: { readonly businessId: string; readonly imageId: string },
    attempt: number,
    log: ResizeImageLog,
  ): Promise<boolean> {
    const delays = await this.settings.get('catalog.image_retry_delays_minutes');
    const delay = delays[attempt];
    if (delay === undefined) return false;
    try {
      await this.jobs.addResizeRetry(
        { businessId: input.businessId, imageId: input.imageId, attempt: attempt + 1 },
        delay * MINUTE_MS,
      );
    } catch {
      // Kuyruğa eklenemezse satır `processing`te asılı kalmasın: kalıcı hata sayılır.
      log.warn(
        { event: 'catalog.image_retry_unscheduled', imageId: input.imageId, attempt },
        'yeniden deneme eklenemedi',
      );
      return false;
    }
    log.warn(
      {
        event: 'catalog.image_retry_scheduled',
        imageId: input.imageId,
        attempt: attempt + 1,
        delayMinutes: delay,
      },
      'ürün görseli yeniden denenecek',
    );
    return true;
  }
}
