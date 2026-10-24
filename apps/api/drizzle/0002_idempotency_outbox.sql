-- Elle eklenen bölüm aşağıda; drizzle-kit bu dosyayı yeniden üretmez.
CREATE TABLE "idempotency_keys" (
	"key" text NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"request_hash" text NOT NULL,
	"status_code" integer,
	"response_body" jsonb,
	"locked_until" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "idempotency_keys_key_user_id_pk" PRIMARY KEY("key","user_id")
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"business_ids" uuid[] NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text
);
--> statement-breakpoint
CREATE INDEX "outbox_events_unprocessed_idx" ON "outbox_events" USING btree ("processed_at") WHERE "outbox_events"."processed_at" IS NULL;
--> statement-breakpoint
-- ===== Elle eklenen bölüm (F1.2b) =====
-- İki tablo da S sınıfıdır (data-model §1.1, F1 faz spesifikasyonu §6.6). Fonksiyonların hepsi
-- migrator sahipli SECURITY DEFINER; search_path pg_temp en sonda; PUBLIC çalıştıramaz.
COMMENT ON TABLE "idempotency_keys" IS 'rls:S';
--> statement-breakpoint
COMMENT ON TABLE "outbox_events" IS 'rls:S';
--> statement-breakpoint
REVOKE ALL ON TABLE "idempotency_keys" FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON TABLE "outbox_events" FROM PUBLIC;
--> statement-breakpoint
-- Olay, durumu değiştiren servisin işleminde app_user tarafından yazılır (ADR-0010). RETURNING
-- kullanılmaz (SELECT yetkisi yok); bigserial için dizide USAGE gerekir.
GRANT INSERT ON TABLE "outbox_events" TO app_user;
--> statement-breakpoint
GRANT USAGE ON SEQUENCE "outbox_events_id_seq" TO app_user;
--> statement-breakpoint
-- İsteği kilitler veya saklanan sonucu bildirir. Sonuç:
--   reserved    : bu istek işleyecek (yeni kayıt, süresi dolmuş kayıt veya kilidi geçmiş kayıt)
--   replay      : aynı özetle tamamlanmış yanıt var (stored_status, stored_body)
--   conflict    : aynı anahtar farklı istek özetiyle kayıtlı
--   in_progress : aynı istek şu an işleniyor
-- Zaman uygulamanın Clock'undan parametre olarak gelir (coding-guidelines §3.10).
CREATE FUNCTION idempotency_reserve(
  p_key text,
  p_user_id uuid,
  p_endpoint text,
  p_request_hash text,
  p_now timestamptz,
  p_locked_until timestamptz,
  p_expires_at timestamptz
)
RETURNS TABLE (result text, stored_status integer, stored_body jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  existing public.idempotency_keys%ROWTYPE;
BEGIN
  INSERT INTO public.idempotency_keys AS k
         (key, user_id, endpoint, request_hash, locked_until, expires_at)
  VALUES (p_key, p_user_id, p_endpoint, p_request_hash, p_locked_until, p_expires_at)
  ON CONFLICT (key, user_id) DO NOTHING;
  IF FOUND THEN
    RETURN QUERY SELECT 'reserved'::text, NULL::integer, NULL::jsonb;
    RETURN;
  END IF;

  SELECT k.* INTO existing
    FROM public.idempotency_keys k
   WHERE k.key = p_key AND k.user_id = p_user_id
   FOR UPDATE;

  IF existing.expires_at <= p_now
     OR (existing.status_code IS NULL AND existing.locked_until <= p_now) THEN
    UPDATE public.idempotency_keys k
       SET endpoint = p_endpoint,
           request_hash = p_request_hash,
           status_code = NULL,
           response_body = NULL,
           locked_until = p_locked_until,
           expires_at = p_expires_at
     WHERE k.key = p_key AND k.user_id = p_user_id;
    RETURN QUERY SELECT 'reserved'::text, NULL::integer, NULL::jsonb;
  ELSIF existing.request_hash <> p_request_hash THEN
    RETURN QUERY SELECT 'conflict'::text, NULL::integer, NULL::jsonb;
  ELSIF existing.status_code IS NULL THEN
    RETURN QUERY SELECT 'in_progress'::text, NULL::integer, NULL::jsonb;
  ELSE
    RETURN QUERY SELECT 'replay'::text, existing.status_code, existing.response_body;
  END IF;
END;
$$;
--> statement-breakpoint
-- Kilitli kaydı yanıtla tamamlar. Kayıt başka bir istek tarafından devralındıysa false döner.
CREATE FUNCTION idempotency_complete(
  p_key text,
  p_user_id uuid,
  p_request_hash text,
  p_locked_until timestamptz,
  p_status_code integer,
  p_response_body jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  UPDATE public.idempotency_keys k
     SET status_code = p_status_code,
         response_body = p_response_body,
         locked_until = NULL
   WHERE k.key = p_key
     AND k.user_id = p_user_id
     AND k.request_hash = p_request_hash
     AND k.locked_until = p_locked_until
     AND k.status_code IS NULL;
  RETURN FOUND;
END;
$$;
--> statement-breakpoint
-- Handler hata verdiyse kilit kaldırılır; istemci aynı anahtarla yeniden deneyebilir.
CREATE FUNCTION idempotency_release(
  p_key text,
  p_user_id uuid,
  p_request_hash text,
  p_locked_until timestamptz
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  DELETE FROM public.idempotency_keys k
   WHERE k.key = p_key
     AND k.user_id = p_user_id
     AND k.request_hash = p_request_hash
     AND k.locked_until = p_locked_until
     AND k.status_code IS NULL;
$$;
--> statement-breakpoint
-- İşlenmemiş ve ölü olmayan olayları id sırasıyla kilitleyerek alır. Kilit, çağıran işlem
-- bitene kadar sürer; başka bir dağıtıcı aynı olayları atlar (SKIP LOCKED).
CREATE FUNCTION outbox_claim_batch(p_limit integer, p_max_attempts integer)
RETURNS TABLE (
  id bigint,
  type text,
  aggregate_type text,
  aggregate_id uuid,
  business_ids uuid[],
  payload jsonb,
  attempts integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT e.id, e.type, e.aggregate_type, e.aggregate_id, e.business_ids, e.payload, e.attempts
    FROM public.outbox_events e
   WHERE e.processed_at IS NULL
     AND e.attempts < p_max_attempts
   ORDER BY e.id
   LIMIT p_limit
   FOR UPDATE SKIP LOCKED;
$$;
--> statement-breakpoint
CREATE FUNCTION outbox_mark_processed(p_id bigint, p_processed_at timestamptz)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  UPDATE public.outbox_events e
     SET processed_at = p_processed_at
   WHERE e.id = p_id AND e.processed_at IS NULL;
$$;
--> statement-breakpoint
-- Başarısız denemeyi kaydeder ve yeni deneme sayısını döner. p_error kişisel veri içermez
-- (yalnızca hata türü / SQLSTATE).
CREATE FUNCTION outbox_mark_failed(p_id bigint, p_error text)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  UPDATE public.outbox_events e
     SET attempts = e.attempts + 1,
         last_error = left(p_error, 200)
   WHERE e.id = p_id
  RETURNING e.attempts;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION idempotency_reserve(text, uuid, text, text, timestamptz, timestamptz, timestamptz) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION idempotency_complete(text, uuid, text, timestamptz, integer, jsonb) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION idempotency_release(text, uuid, text, timestamptz) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION outbox_claim_batch(integer, integer) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION outbox_mark_processed(bigint, timestamptz) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION outbox_mark_failed(bigint, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION idempotency_reserve(text, uuid, text, text, timestamptz, timestamptz, timestamptz) TO app_user;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION idempotency_complete(text, uuid, text, timestamptz, integer, jsonb) TO app_user;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION idempotency_release(text, uuid, text, timestamptz) TO app_user;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION outbox_claim_batch(integer, integer) TO app_user;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION outbox_mark_processed(bigint, timestamptz) TO app_user;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION outbox_mark_failed(bigint, text) TO app_user;
