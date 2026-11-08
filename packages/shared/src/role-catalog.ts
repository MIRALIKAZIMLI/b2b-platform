// Platform unvan ve rol şablonu kataloğu (F2.9, US-012): API ve web admin ekranının paylaştığı
// kurallar. Uçlar ve menü öğeleri `CATALOG_ADMIN_ROLES` ile korunur (kart F2.9 V1: productreport
// "Çeviri ve içerik: ortak katalog").
import { z } from 'zod';
import type { PlatformRole } from './platform-roles';

export const CATALOG_ADMIN_ROLES: readonly PlatformRole[] = ['super_admin', 'content'];

/** openapi `CatalogCode`: benzersiz, sonradan değişmez (V5). */
export const CATALOG_CODE_PATTERN = /^[a-z][a-z0-9_]{2,62}$/;
export const catalogCodeSchema = z.string().regex(CATALOG_CODE_PATTERN);

/** openapi `CatalogName` dil başına üst sınır. */
export const CATALOG_NAME_MAX = 80;
const nameText = z.string().trim().min(1).max(CATALOG_NAME_MAX);

/** openapi `CatalogName`: az, ru, tr zorunlu; en isteğe bağlı (ADR-0007 pilot dilleri). */
export const catalogNameSchema = z.strictObject({
  az: nameText,
  ru: nameText,
  tr: nameText,
  en: nameText.optional(),
});
export type CatalogName = z.infer<typeof catalogNameSchema>;
