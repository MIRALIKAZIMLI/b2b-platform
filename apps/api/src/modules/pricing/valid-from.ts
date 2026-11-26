// Geleceğe tarihli fiyatın başlangıç anı (US-034 AC6, R29; kart K4). Toptancı takvim günü seçer;
// fiyat o gün toptancının saat diliminde (`businesses.timezone`) 00:00'da geçerli olur. Saat
// `Clock`'tan gelir; bu dosya yalnız saf dönüşüm yapar.

/** `instant` anında `timeZone`'un UTC'ye farkı (ms; Asia/Baku için +4 saat). */
function offsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    value('year'),
    value('month') - 1,
    value('day'),
    value('hour'),
    value('minute'),
    value('second'),
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** `YYYY-MM-DD` gününün `timeZone`'daki 00:00 anı (UTC). Yaz saati geçişinde fark yeniden ölçülür. */
export function localMidnight(day: string, timeZone: string): Date {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  const wallClock = Date.UTC(year, month - 1, date);
  const first = wallClock - offsetMs(new Date(wallClock), timeZone);
  return new Date(wallClock - offsetMs(new Date(first), timeZone));
}

/** `instant` anının `timeZone`'daki takvim günü (`YYYY-MM-DD`). */
export function localDay(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/** İleri tarih kuralı (K4): gün, toptancının bugününden sonra olmalı (yarın veya sonrası). */
export function isFutureDay(day: string, now: Date, timeZone: string): boolean {
  return day > localDay(now, timeZone);
}
