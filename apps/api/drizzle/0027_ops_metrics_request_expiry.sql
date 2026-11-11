CREATE TABLE "ops_metrics" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"measured_at" timestamp with time zone NOT NULL,
	"key" text NOT NULL,
	"value" numeric(18, 4) NOT NULL,
	"labels" jsonb
);
--> statement-breakpoint
CREATE INDEX "ops_metrics_key_measured_idx" ON "ops_metrics" USING btree ("key","measured_at" DESC);--> statement-breakpoint
-- ===== Elle eklenen bölüm (F2.16: istek süre dolumu; US-026, state-machines §1) =====
-- 1) `ops_metrics` S tablosu (data-model §4.1): app_user yalnız INSERT + dizi USAGE (outbox_events
--    kalıbı). Okuma ve 90 gün temizliği F6.7'de. Zamanlanmış işler son çalışmayı buraya yazar.
COMMENT ON TABLE "ops_metrics" IS 'rls:S';
--> statement-breakpoint
REVOKE ALL ON TABLE "ops_metrics" FROM PUBLIC;
--> statement-breakpoint
GRANT INSERT ON TABLE "ops_metrics" TO app_user;
--> statement-breakpoint
GRANT USAGE ON SEQUENCE "ops_metrics_id_seq" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "ops_metrics" TO readonly;
--> statement-breakpoint
-- 2) Süre dolumu sistem işidir: `connection_requests_guard` (0023) `expired` geçişine yalnız
--    migrator rolünde ve bağlamsız izin verir. Tablolar FORCE RLS olduğundan fonksiyonun okuyup
--    yazabilmesi için yalnız migrator rolüne açık politikalar; UPDATE yalnız pending → expired.
CREATE POLICY "connection_requests_definer_select" ON "connection_requests" FOR SELECT TO migrator
  USING (true);
--> statement-breakpoint
CREATE POLICY "connection_requests_definer_expire" ON "connection_requests" FOR UPDATE TO migrator
  USING ("status" = 'pending')
  WITH CHECK ("status" = 'expired');
--> statement-breakpoint
-- Süresi dolan (`expires_at <= p_now`, `ConnectionRequestStateMachine.assertRespondable` ile aynı
-- sınır) en çok `p_limit` pending isteği `expired` yapar. Yalnız bağlamsız sistem işleminden
-- (worker, `withSystemTx`) çağrılır; kiracı veya platform bağlamı 42501. Satırlar FOR UPDATE
-- SKIP LOCKED ile alınır: eşzamanlı ikinci çağrı (veya o an kabul/geri çekme işlemi) aynı satırı
-- atlar, her istek yalnız bir kez `expired` olur (tek etki). Dönüş: istek başına bildirim
-- alıcıları (US-054 "süre doldu": isteği gönderen aktif üyeyse + satıcının aktif adminleri);
-- alıcısı olmayan istek `recipient_user_id = null` ile bir kez döner. Kişisel veri dönmez.
CREATE FUNCTION "connection_requests_expire"(p_now timestamptz, p_limit integer)
  RETURNS TABLE (request_id uuid, seller_id uuid, buyer_id uuid, recipient_user_id uuid)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  IF nullif(current_setting('app.business_id', true), '') IS NOT NULL
     OR nullif(current_setting('app.user_id', true), '') IS NOT NULL
     OR coalesce(nullif(current_setting('app.is_platform', true), ''), 'false') = 'true' THEN
    RAISE EXCEPTION 'connection_requests_expire: yalnız bağlamsız sistem işi' USING ERRCODE = '42501';
  END IF;
  IF p_now IS NULL OR p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'connection_requests_expire: geçersiz parametre' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH due AS (
    SELECT cr.id
      FROM public.connection_requests cr
     WHERE cr.status = 'pending'
       AND cr.expires_at <= p_now
     ORDER BY cr.expires_at, cr.id
     LIMIT p_limit
       FOR UPDATE SKIP LOCKED
  ), expired AS (
    UPDATE public.connection_requests cr
       SET status = 'expired',
           updated_at = p_now
      FROM due
     WHERE cr.id = due.id
       AND cr.status = 'pending'
    RETURNING cr.id, cr.seller_id, cr.buyer_id, cr.sent_by_user_id
  )
  SELECT e.id, e.seller_id, e.buyer_id, r.user_id
    FROM expired e
    LEFT JOIN LATERAL (
      SELECT DISTINCT m.user_id
        FROM public.memberships m
        JOIN public.roles ro ON ro.id = m.role_id
       WHERE m.business_id = e.seller_id
         AND m.status = 'active'
         AND (ro.is_business_admin OR m.user_id = e.sent_by_user_id)
    ) r ON true
   ORDER BY e.id, r.user_id;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "connection_requests_expire"(timestamptz, integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "connection_requests_expire"(timestamptz, integer) TO app_user;
