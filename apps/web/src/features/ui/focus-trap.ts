// Pencere odak tuzağı (Müfettiş 17 #59 L2). Saf: DOM yok, birim testli.

/**
 * Tab tuşunda odak pencerenin dışına çıkacaksa gidilecek öğenin sırası; çıkmayacaksa `undefined`
 * (tarayıcı kendi sırasıyla ilerler). `current` = -1: odak pencerede değil.
 */
export function wrapFocus(current: number, count: number, backwards: boolean): number | undefined {
  if (count === 0) return undefined;
  if (current === -1) return backwards ? count - 1 : 0;
  if (backwards && current === 0) return count - 1;
  if (!backwards && current === count - 1) return 0;
  return undefined;
}

/** Odaklanabilir öğe seçicisi (devre dışı olanlar hariç). */
export const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
