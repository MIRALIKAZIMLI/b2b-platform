'use client';
// API hatası → çevrilmiş mesaj (F3.2b-AC4): taksonomi nedenleri `adminTaxonomy.failure.*`, diğer
// kodlar ortak `errors.*` anahtarları.
import { taxonomyFailure } from '@b2b/shared';
import { useTranslations } from 'next-intl';
import { ApiError } from '../admin-sellers/api';

export function useFailureText(): (failure: unknown) => string {
  const t = useTranslations('adminTaxonomy');
  const tErrors = useTranslations('errors');
  return (failure) => {
    const outcome = taxonomyFailure(failure instanceof ApiError ? failure : undefined);
    return outcome.kind === 'taxonomy' ? t(`failure.${outcome.reason}`) : tErrors(outcome.code);
  };
}
