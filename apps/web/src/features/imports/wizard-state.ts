// İçe aktarma sihirbazının saf yardımcıları (F3.5b): adım, ilerleme, hata mesajı seçimi.
// React'e bağlı değil; birim testi `__tests__/wizard-state.test.ts`.
import type { ImportJobStatus } from '@b2b/shared';
import { ApiError } from '../admin-sellers/api';

/** F1.10 `purpose: import` için tek izinli tür (files.service). */
export const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export type WizardStep = 'upload' | 'check' | 'confirm' | 'result';
export const WIZARD_STEPS: readonly WizardStep[] = ['upload', 'check', 'confirm', 'result'];

/** Worker'ın üzerinde çalıştığı durumlar (ekran izler). */
export function isWorking(status: ImportJobStatus): boolean {
  return status === 'uploaded' || status === 'validating' || status === 'applying';
}

/** İş durumundan sihirbaz adımı; iş yoksa yükleme. */
export function stepOf(status: ImportJobStatus | undefined): WizardStep {
  if (status === undefined) return 'upload';
  if (status === 'uploaded' || status === 'validating') return 'check';
  if (status === 'preview_ready') return 'confirm';
  return 'result';
}

/** Seçilen dosya .xlsx mi? Tarayıcı türü bazen boş verir; uzantı da kabul edilir. */
export function isXlsxFile(file: { name: string; type: string }): boolean {
  return file.type === XLSX_CONTENT_TYPE || file.name.toLowerCase().endsWith('.xlsx');
}

export interface ApplyProgress {
  /** Uygulanmış veri satırı (başlık hariç). */
  readonly done: number;
  readonly total: number;
  /** 0–100; iş bitmeden 100 gösterilmez. */
  readonly percent: number;
}

/**
 * Uygulama ilerlemesi (Müfettiş 29 #84 not 1). `appliedUntilRow` son uygulanan Excel satırıdır
 * (başlık 1; 0/null = henüz parti bitmedi); toplam önizlemedeki eklenecek + güncellenecek + hatalı
 * satır sayısıdır. Boş satırlar sayıyı aşırabilir; sınırlanır.
 */
export function applyProgress(
  appliedUntilRow: number | null,
  stats: { insert: number; update: number; error: number },
): ApplyProgress {
  const total = Math.max(0, stats.insert + stats.update + stats.error);
  const done = Math.min(total, Math.max(0, (appliedUntilRow ?? 0) - 1));
  const percent = total === 0 ? 0 : Math.min(99, Math.floor((done / total) * 100));
  return { done, total, percent };
}

/** Kısmen uygulanmış başarısız iş: kaç veri satırı kaldı (0 = hiç uygulanmadı). */
export function appliedRowsOfFailed(appliedUntilRow: number | null): number {
  return Math.max(0, (appliedUntilRow ?? 0) - 1);
}

export type UploadErrorKey = 'type' | 'size' | 'failed' | 'forbidden';

/** Yükleme hatası → mesaj anahtarı (F1.10 `FILE_INVALID`, F3.5a 422 `fileId`). */
export function uploadErrorKey(error: unknown): UploadErrorKey {
  if (!(error instanceof ApiError)) return 'failed';
  const details = (error.details ?? {}) as Record<string, unknown>;
  if (error.code === 'FILE_INVALID') {
    if (details.reason === 'size') return 'size';
    if (details.reason === 'content_type' || details.reason === 'signature') return 'type';
  }
  if (error.code === 'PERMISSION_DENIED' || error.code === 'FORBIDDEN') return 'forbidden';
  return 'failed';
}

export type ApplyErrorKey = 'not_allowed' | 'expired' | 'moved' | 'failed';

/**
 * Onay hatası → mesaj anahtarı. 403: işi açan değil ya da fiyat izni kalktı (S1 = A; Müfettiş 29
 * D1); 404: önizleme süresi doldu (SF-08); 409: iş başka bir yolla ilerledi (ikinci onay).
 */
export function applyErrorKey(error: unknown): ApplyErrorKey {
  if (!(error instanceof ApiError)) return 'failed';
  if (error.code === 'PERMISSION_DENIED' || error.code === 'FORBIDDEN') return 'not_allowed';
  if (error.code === 'NOT_FOUND') return 'expired';
  if (error.code === 'INVALID_STATE_TRANSITION' || error.code === 'CONFLICT') return 'moved';
  return 'failed';
}

/** Yerel/CI depo adresi API altındaysa aynı kökene çevrilir (F3.4b ile aynı kural). */
export function sameOriginUrl(url: string, origin: string): string {
  try {
    const parsed = new URL(url, origin);
    return parsed.pathname.startsWith('/api/v1/') ? `${parsed.pathname}${parsed.search}` : url;
  } catch {
    return url;
  }
}

/**
 * #85 notu (F3.7b): iş yüklenemedi. Yalnız 404 "süresi doldu / yok" demektir; ağ veya sunucu
 * hatası geçicidir ve yeniden denenir (ilk yüklemede "süresi doldu" görünmesin).
 */
export function jobLoadErrorKey(error: unknown): 'missing' | 'retry' {
  return error instanceof ApiError && error.code === 'NOT_FOUND' ? 'missing' : 'retry';
}

/**
 * #85 notu: "Təsdiqlə" baştan doğru görünür. Sunucunun `canApply`'ı (işi açan = ben, fiyat izni
 * yerinde, süre dolmadı) ve uygulanacak satır gerekir; onay sırasında 403/404 gelirse ayrıca kalkar.
 */
export function confirmState(job: {
  readonly canApply: boolean;
  readonly stats: { readonly insert: number; readonly update: number };
}): 'show' | 'nothing' | 'not_allowed' {
  if (job.stats.insert + job.stats.update === 0) return 'nothing';
  return job.canApply ? 'show' : 'not_allowed';
}
