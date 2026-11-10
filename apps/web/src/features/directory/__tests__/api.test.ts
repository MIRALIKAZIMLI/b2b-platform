import { describe, expect, it } from 'vitest';
import { ApiError } from '../../admin-sellers/api';
import { retryAfterOf } from '../api';

describe('F2.11b web dizin', () => {
  it('F2.11b-AC11: 429 yanıtındaki bekleme süresi mesaja taşınır; diğer hatalarda yok', () => {
    const limited = new ApiError({ code: 'RATE_LIMITED', details: { retryAfter: 12 } }, 429);
    expect(retryAfterOf(limited)).toBe(12);
    expect(retryAfterOf(new ApiError({ code: 'PERMISSION_DENIED' }, 403))).toBeUndefined();
    expect(retryAfterOf(new Error('x'))).toBeUndefined();
  });
});
