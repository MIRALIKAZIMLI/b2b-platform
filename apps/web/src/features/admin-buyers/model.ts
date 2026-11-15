// Perakendeci moderasyon ekranının saf kuralları (F2.18b; US-015, US-016). Hangi eylemin
// gösterileceği kayıt durumundan ve platform rolünden çıkar; asıl kontrol API'dedir
// (`@RequirePlatformRole`, `BusinessStateMachine`).
import {
  ADMIN_NOTE_MAX,
  ADMIN_NOTE_MIN,
  BUYER_ADMIN_WRITE_ROLES,
  type BusinessStatusAction,
  platformRoleAllows,
  type VoenRejectReason,
} from '@b2b/shared';

export interface BuyerLike {
  readonly voen: string | null;
  readonly verifiedAt: string | null;
  readonly status: 'active' | 'suspended' | 'dormant';
}

/** VÖEN rozeti: doğrulanmış, kuyrukta (girilmiş, doğrulanmamış) veya hiç girilmemiş. */
export type VoenState = 'verified' | 'pending' | 'missing';

export function voenState(buyer: BuyerLike): VoenState {
  if (buyer.voen === null) return 'missing';
  return buyer.verifiedAt === null ? 'pending' : 'verified';
}

export interface BuyerActions {
  readonly verify: boolean;
  readonly reject: boolean;
  readonly status: readonly BusinessStatusAction[];
}

const STATUS_ACTIONS: Readonly<Record<BuyerLike['status'], readonly BusinessStatusAction[]>> = {
  active: ['suspend', 'archive'],
  suspended: ['unsuspend', 'archive'],
  dormant: ['archive'],
};

const NONE: BuyerActions = { verify: false, reject: false, status: [] };

/**
 * Kayıt penceresinde gösterilecek eylemler. Destek rolü (ve rolsüz) yalnız görür. VÖEN kararı
 * yalnız kuyruktaki kayıtta. Durum eylemleri state-machines §9 geçiş tablosuyla aynı: askıya alma
 * yalnız aktif kayıtta (pasif → askı geçişi yok, Müfettiş 23 M1), kaldırma askıdakinde; "sil"
 * (archive) her durumda.
 */
export function buyerActions(buyer: BuyerLike, role: string | null): BuyerActions {
  if (!platformRoleAllows(BUYER_ADMIN_WRITE_ROLES, role)) return NONE;
  const pending = voenState(buyer) === 'pending';
  return {
    verify: pending,
    reject: pending,
    status: STATUS_ACTIONS[buyer.status],
  };
}

/** Gerekçe metni (yalnız audit): 3–500 karakter, kırpılmış. Geçerliyse `undefined`. */
export function noteProblem(note: string): 'too_short' | 'too_long' | undefined {
  const length = note.trim().length;
  if (length < ADMIN_NOTE_MIN) return 'too_short';
  if (length > ADMIN_NOTE_MAX) return 'too_long';
  return undefined;
}

export interface StatusForm {
  readonly reason: string;
  readonly confirmed: boolean;
}

export const EMPTY_STATUS_FORM: StatusForm = { reason: '', confirmed: false };

/** İki adımlı onay: gerekçe geçerli ve onay kutusu işaretli olmadan gönderilmez. */
export function statusBody(
  action: BusinessStatusAction,
  form: StatusForm,
): { action: BusinessStatusAction; reason: string } | undefined {
  if (!form.confirmed || noteProblem(form.reason) !== undefined) return undefined;
  return { action, reason: form.reason.trim() };
}

export interface RejectForm {
  readonly reason: VoenRejectReason | undefined;
  readonly note: string;
}

export const EMPTY_REJECT_FORM: RejectForm = { reason: undefined, note: '' };

/** Reddetme gövdesi: gerekçe kodu zorunlu; not boşsa gönderilmez, doluysa 3–500. */
export function rejectBody(
  form: RejectForm,
): { decision: 'reject'; reason: VoenRejectReason; note?: string } | undefined {
  if (form.reason === undefined) return undefined;
  const note = form.note.trim();
  if (note === '') return { decision: 'reject', reason: form.reason };
  if (noteProblem(note) !== undefined) return undefined;
  return { decision: 'reject', reason: form.reason, note };
}

/** Durum işleminden sonra liste üstündeki sonuç metninin anahtarı (`adminBuyers.done.*`). */
export function outcomeKey(
  action: BusinessStatusAction,
  outcome: 'updated' | 'archived' | 'deleted',
): 'suspended' | 'unsuspended' | 'archived' | 'deleted' {
  if (outcome === 'deleted') return 'deleted';
  if (outcome === 'archived') return 'archived';
  return action === 'unsuspend' ? 'unsuspended' : 'suspended';
}
