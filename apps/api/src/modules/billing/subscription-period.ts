// Abonelik dönemi (F2.1a, Mimar kararı; belgede ayrı kural yok — PR'da VARSAYIM olarak yazıldı):
// başlangıç = işletmenin saat diliminde bugün; bitiş = başlangıç + 1 dönem (ay/yıl) − 1 gün.
// Ay sonu taşması: hedef ayda o gün yoksa ayın son gününe kırpılır, sonra 1 gün çıkarılır
// (31 Ocak başlangıç → 27 Şubat bitiş; artık yılda 28 Şubat). Tarihler `YYYY-MM-DD`.
import type { PlanPeriod } from './billing.schema';

export interface SubscriptionPeriod {
  readonly start: string;
  readonly end: string;
}

/** `instant` anının `timeZone` içindeki takvim günü (`YYYY-MM-DD`). */
export function localDate(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function format(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** İlk dönem: bugün (işletme saat dilimi) → +1 ay/yıl −1 gün. */
export function firstSubscriptionPeriod(
  now: Date,
  timeZone: string,
  period: PlanPeriod,
): SubscriptionPeriod {
  const start = localDate(now, timeZone);
  const [year, month, day] = start.split('-').map(Number) as [number, number, number];
  const months = period === 'year' ? 12 : 1;
  const targetMonthIndex = month - 1 + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = targetMonthIndex % 12;
  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth));
  const next = new Date(Date.UTC(targetYear, targetMonth, targetDay));
  next.setUTCDate(next.getUTCDate() - 1);
  return { start, end: format(next) };
}
