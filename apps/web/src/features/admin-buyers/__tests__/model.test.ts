// F2.18b: perakendeci moderasyon ekranının saf kuralları (US-015, US-016).
import { describe, expect, it } from 'vitest';
import {
  buyerActions,
  EMPTY_REJECT_FORM,
  EMPTY_STATUS_FORM,
  noteProblem,
  outcomeKey,
  rejectBody,
  statusBody,
  voenState,
} from '../model';

const pending = { voen: '1234567891', verifiedAt: null, status: 'active' } as const;
const verified = { ...pending, verifiedAt: '2026-11-15T10:00:00Z' } as const;

describe('voenState', () => {
  it('US-015 AC1 kuyruk: VÖEN girilmiş ve doğrulanmamış', () => {
    expect(voenState(pending)).toBe('pending');
    expect(voenState(verified)).toBe('verified');
    expect(voenState({ ...pending, voen: null })).toBe('missing');
  });
});

describe('buyerActions', () => {
  it('US-015 AC2 doğrula/reddet yalnız kuyruktaki kayıtta ve yazma rolünde', () => {
    expect(buyerActions(pending, 'operations')).toMatchObject({ verify: true, reject: true });
    expect(buyerActions(verified, 'super_admin')).toMatchObject({ verify: false, reject: false });
    expect(buyerActions({ ...pending, voen: null }, 'operations').verify).toBe(false);
  });

  it('US-016 AC1 askıya al yalnız aktif kayıtta, kaldır askıdakinde; sil her durumda (§9)', () => {
    expect(buyerActions(verified, 'operations').status).toEqual(['suspend', 'archive']);
    // Müfettiş 23 M1: dormant → suspended geçişi yok (409); pasif kayıtta yalnız "sil".
    expect(buyerActions({ ...verified, status: 'dormant' }, 'operations').status).toEqual([
      'archive',
    ]);
    expect(buyerActions({ ...verified, status: 'suspended' }, 'operations').status).toEqual([
      'unsuspend',
      'archive',
    ]);
  });

  it('F2.18b destek ve rolsüz kullanıcı yalnız görür (yazma düğmesi yok)', () => {
    for (const role of ['support', 'content', null]) {
      expect(buyerActions(pending, role)).toEqual({ verify: false, reject: false, status: [] });
    }
  });
});

describe('gerekçe ve iki adımlı onay', () => {
  it('US-016 gerekçe 3–500 karakter, kırpılarak', () => {
    expect(noteProblem('  ab ')).toBe('too_short');
    expect(noteProblem('abc')).toBeUndefined();
    expect(noteProblem('x'.repeat(501))).toBe('too_long');
  });

  it('US-016 AC1–AC3 onay kutusu ve geçerli gerekçe olmadan gövde yok', () => {
    expect(statusBody('archive', EMPTY_STATUS_FORM)).toBeUndefined();
    expect(statusBody('archive', { reason: 'Mükərrər hesab', confirmed: false })).toBeUndefined();
    expect(statusBody('archive', { reason: 'ab', confirmed: true })).toBeUndefined();
    expect(statusBody('suspend', { reason: '  Şikayət  ', confirmed: true })).toEqual({
      action: 'suspend',
      reason: 'Şikayət',
    });
  });

  it('US-015 AC2 reddetmede gerekçe kodu zorunlu, not isteğe bağlı', () => {
    expect(rejectBody(EMPTY_REJECT_FORM)).toBeUndefined();
    expect(rejectBody({ reason: 'name_mismatch', note: '  ' })).toEqual({
      decision: 'reject',
      reason: 'name_mismatch',
    });
    expect(rejectBody({ reason: 'other', note: 'ab' })).toBeUndefined();
    expect(rejectBody({ reason: 'other', note: ' Saxta sənəd ' })).toEqual({
      decision: 'reject',
      reason: 'other',
      note: 'Saxta sənəd',
    });
  });

  it('US-016 AC2–AC3 sonuç metni: arşiv ve kalıcı silme ayrı', () => {
    expect(outcomeKey('archive', 'deleted')).toBe('deleted');
    expect(outcomeKey('archive', 'archived')).toBe('archived');
    expect(outcomeKey('suspend', 'updated')).toBe('suspended');
    expect(outcomeKey('unsuspend', 'updated')).toBe('unsuspended');
  });
});
