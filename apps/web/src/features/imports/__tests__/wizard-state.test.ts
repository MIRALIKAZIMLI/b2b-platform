// F3.5b birim: sihirbaz adımı, ilerleme, hata mesajı seçimi (US-031 AC2–AC3; S1 = A; Müfettiş 29
// #84 not 1: kısmi uygulamada uygulanan satır).
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../admin-sellers/api';
import {
  applyErrorKey,
  applyProgress,
  appliedRowsOfFailed,
  isWorking,
  isXlsxFile,
  sameOriginUrl,
  stepOf,
  uploadErrorKey,
  XLSX_CONTENT_TYPE,
} from '../wizard-state';

describe('F3.5b içe aktarma sihirbazı (birim)', () => {
  it('F3.5b-STEP iş durumu doğru adıma ve izlemeye düşer', () => {
    expect(stepOf(undefined)).toBe('upload');
    expect(stepOf('uploaded')).toBe('check');
    expect(stepOf('validating')).toBe('check');
    expect(stepOf('preview_ready')).toBe('confirm');
    expect(stepOf('applying')).toBe('result');
    expect(stepOf('done')).toBe('result');
    expect(stepOf('failed')).toBe('result');
    expect(['uploaded', 'validating', 'applying'].every((s) => isWorking(s as never))).toBe(true);
    expect(isWorking('preview_ready')).toBe(false);
    expect(isWorking('done')).toBe(false);
    expect(isWorking('failed')).toBe(false);
  });

  it('F3.5b-AC2 yalnız .xlsx kabul edilir (tür boşsa uzantı)', () => {
    expect(isXlsxFile({ name: 'a.xlsx', type: XLSX_CONTENT_TYPE })).toBe(true);
    expect(isXlsxFile({ name: 'MAL.XLSX', type: '' })).toBe(true);
    expect(isXlsxFile({ name: 'a.xls', type: 'application/vnd.ms-excel' })).toBe(false);
    expect(isXlsxFile({ name: 'a.csv', type: 'text/csv' })).toBe(false);
  });

  it('F3.5b-PROG uygulama ilerlemesi başlık satırını sayar, sınırlanır, 100 göstermez', () => {
    const stats = { insert: 6, update: 3, error: 1 };
    expect(applyProgress(null, stats)).toEqual({ done: 0, total: 10, percent: 0 });
    expect(applyProgress(0, stats)).toEqual({ done: 0, total: 10, percent: 0 });
    expect(applyProgress(6, stats)).toEqual({ done: 5, total: 10, percent: 50 });
    expect(applyProgress(11, stats)).toEqual({ done: 10, total: 10, percent: 99 });
    expect(applyProgress(40, stats).done).toBe(10);
    expect(applyProgress(3, { insert: 0, update: 0, error: 0 }).percent).toBe(0);
  });

  it('F3.5b-PART başarısız işte uygulanan veri satırı (başlık hariç)', () => {
    expect(appliedRowsOfFailed(null)).toBe(0);
    expect(appliedRowsOfFailed(0)).toBe(0);
    expect(appliedRowsOfFailed(1)).toBe(0);
    expect(appliedRowsOfFailed(501)).toBe(500);
  });

  it('F3.5b-AC3 onay hatası: 403 yükleyen değil, 404 süresi doldu, 409 iş ilerledi', () => {
    const err = (code: string, status: number) => new ApiError({ code }, status);
    expect(applyErrorKey(err('PERMISSION_DENIED', 403))).toBe('not_allowed');
    expect(applyErrorKey(new ApiError(undefined, 403))).toBe('not_allowed');
    expect(applyErrorKey(err('NOT_FOUND', 404))).toBe('expired');
    expect(applyErrorKey(err('INVALID_STATE_TRANSITION', 409))).toBe('moved');
    expect(applyErrorKey(new ApiError(undefined, 500))).toBe('failed');
    expect(applyErrorKey(new Error('x'))).toBe('failed');
  });

  it('F3.5b-UPL yükleme hatası mesajı', () => {
    const fileInvalid = (reason: string) =>
      new ApiError({ code: 'FILE_INVALID', details: { reason } }, 422);
    expect(uploadErrorKey(fileInvalid('size'))).toBe('size');
    expect(uploadErrorKey(fileInvalid('signature'))).toBe('type');
    expect(uploadErrorKey(fileInvalid('content_type'))).toBe('type');
    expect(uploadErrorKey(new ApiError({ code: 'PERMISSION_DENIED' }, 403))).toBe('forbidden');
    expect(uploadErrorKey(new ApiError({ code: 'VALIDATION_FAILED' }, 422))).toBe('failed');
    expect(uploadErrorKey(new Error('x'))).toBe('failed');
  });

  it('F3.5b-URL API altındaki depo adresi aynı kökene çevrilir', () => {
    const origin = 'http://localhost:3001';
    expect(sameOriginUrl('http://localhost:3000/api/v1/dev/storage/x?sig=1', origin)).toBe(
      '/api/v1/dev/storage/x?sig=1',
    );
    expect(sameOriginUrl('https://cdn.example.com/a.xlsx?s=1', origin)).toBe(
      'https://cdn.example.com/a.xlsx?s=1',
    );
  });
});
