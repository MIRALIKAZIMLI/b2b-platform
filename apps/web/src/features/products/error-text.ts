'use client';
// Ürün formu hata metinleri (F3.3b-AC7): alan nedeni `products.error.<neden>`; API hata kodu
// (422 dışı) ortak `errors.<KOD>`.
import type { ProductFieldErrors } from '@b2b/shared';
import { useTranslations } from 'next-intl';

export function useFieldError(errors: ProductFieldErrors): (path: string) => string | undefined {
  const t = useTranslations('products');
  return (path) => {
    const reason = errors[path];
    return reason === undefined ? undefined : t(`error.${reason}`);
  };
}
