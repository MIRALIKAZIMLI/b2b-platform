// Bağlantısız hesap aşama kuralı (F2.17, US-027 AC1–AC4; state-machines §9). Saf fonksiyon: gece
// işi her uygun perakendeci için bir sonraki adımı buradan alır; veritabanı fonksiyonları kilitli
// satırda yalnız uygunluğu ve aşama sırasını yeniden denetler.
// - Gün = geçen süre / 24 saat (saat dilimi yok; kart K2).
// - Kaçırılan geceler (K3): vadesi gelen en yüksek hatırlatma gider, eskiler atlanır; sayaç uyarı
//   gününü geçtiyse hatırlatma gitmez, doğrudan uyarı.
// - Pasifleşme yalnız uyarıdan, arşiv yalnız pasifleşmeden ve aradaki gün farkı kadar sonra
//   (uyarıdaki "N gün sonra" sözü ve AC4 "son bildirim gönderilmiş" koşulu).

export const DORMANT_STAGES = [
  'none',
  'reminded_7',
  'reminded_30',
  'warned',
  'deactivated',
] as const;
export type DormantStage = (typeof DORMANT_STAGES)[number];

/** Bir sonraki adım; `archive` = 180. gün (işletme arşivlenir, kişisel veri silinir). */
export type DormantStep = 'reminded_7' | 'reminded_30' | 'warned' | 'deactivated' | 'archive';

export interface DormantSettings {
  /** Artan; en çok 2 eleman (`reminded_7`, `reminded_30`). */
  readonly reminderDays: readonly number[];
  readonly warningDay: number;
  readonly deactivateDay: number;
  readonly deleteDay: number;
}

export interface DormantState {
  readonly status: 'active' | 'dormant';
  readonly stage: DormantStage;
  /** Aşamanın yazıldığı an (`none`'da null). */
  readonly stageAt: Date | null;
  /** Sayacın başladığı an (kayıt veya son giriş). */
  readonly since: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function elapsedDays(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / DAY_MS;
}

/** Taramaya girecek en küçük sayaç (gün): ilk hatırlatma ya da (hatırlatma yoksa) uyarı. */
export function dormantMinScanDays(settings: DormantSettings): number {
  return Math.min(settings.reminderDays[0] ?? settings.warningDay, settings.warningDay);
}

/** Uyarı bildirimindeki "N gün sonra pasifleşecek" sayısı. */
export function dormantWarningLeadDays(settings: DormantSettings): number {
  return settings.deactivateDay - settings.warningDay;
}

export function nextDormantStep(
  state: DormantState,
  settings: DormantSettings,
  now: Date,
): DormantStep | undefined {
  const days = elapsedDays(state.since, now);
  switch (state.stage) {
    case 'none':
    case 'reminded_7':
    case 'reminded_30':
      return nextReminderStep(state.stage, days, settings);
    case 'warned':
      if (state.status !== 'active' || state.stageAt === null) return undefined;
      return days >= settings.deactivateDay &&
        elapsedDays(state.stageAt, now) >= settings.deactivateDay - settings.warningDay
        ? 'deactivated'
        : undefined;
    case 'deactivated':
      if (state.status !== 'dormant' || state.stageAt === null) return undefined;
      return days >= settings.deleteDay &&
        elapsedDays(state.stageAt, now) >= settings.deleteDay - settings.deactivateDay
        ? 'archive'
        : undefined;
  }
}

function nextReminderStep(
  stage: 'none' | 'reminded_7' | 'reminded_30',
  days: number,
  settings: DormantSettings,
): DormantStep | undefined {
  if (days >= settings.warningDay) return 'warned';
  const [first, second] = settings.reminderDays;
  if (second !== undefined && days >= second && stage !== 'reminded_30') return 'reminded_30';
  if (first !== undefined && days >= first && stage === 'none') return 'reminded_7';
  return undefined;
}
