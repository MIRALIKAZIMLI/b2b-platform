// `directory` kuyruğunun işleri (F2.11a). Outbox olayları perakendecinin indeks belgesini
// yeniler; `directory.reindex` gece tam yeniden indekslemedir (ADR-0011 §1).
import { z } from 'zod';

/** İndeks belgesini yenileyen outbox olayları; yükte yalnız `businessId` kullanılır. */
export const DIRECTORY_EVENT_TYPES: readonly string[] = [
  'buyer.registered',
  'buyer.privacy_changed',
  'buyer.profile_changed',
];

/** Gece tam yeniden indeksleme işinin adı ve zamanlayıcı kimliği. */
export const DIRECTORY_REINDEX_JOB = 'directory.reindex';

/** Kilit anahtarı: worker işi ve `search:reindex` komutu aynı anda çalışmaz (ADR-0011 §4). */
export const DIRECTORY_REINDEX_LOCK_KEY = 'lock:directory:reindex';

/** Kilit tutulurken yenilenen perakendecilerin kimlikleri (Müfettiş 15 M1). */
export const DIRECTORY_REINDEX_DIRTY_KEY = 'directory:reindex:dirty';

export const directoryOutboxJobSchema = z.object({
  /** outbox_events.id (bigint, metin); idempotens: aynı olay iki kez işlense de sonuç aynı. */
  eventId: z.string().regex(/^\d{1,19}$/),
  type: z.string(),
  payload: z.object({ businessId: z.uuid() }).loose(),
});
