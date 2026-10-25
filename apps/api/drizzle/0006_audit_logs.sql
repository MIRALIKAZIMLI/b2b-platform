-- Elle eklenen bölüm aşağıda; drizzle-kit bu dosyayı yeniden üretmez.
-- Geri alma: DROP TABLE audit_logs; settings_put'u DROP edip 0000/0001'deki RETURNS void
-- tanımıyla (search_path = pg_catalog, public, pg_temp) yeniden oluştur, REVOKE/GRANT'ları tekrarla.
CREATE TABLE "audit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"actor_user_id" uuid,
	"actor_type" text NOT NULL,
	"impersonation_session_id" uuid,
	"business_id" uuid,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"ip" "inet",
	"request_id" text,
	CONSTRAINT "audit_logs_actor_type_check" CHECK ("audit_logs"."actor_type" in ('user', 'system', 'platform'))
);
--> statement-breakpoint
CREATE INDEX "audit_logs_business_occurred_idx" ON "audit_logs" USING btree ("business_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_logs_target_idx" ON "audit_logs" USING btree ("target_type","target_id");
--> statement-breakpoint
-- ===== Elle eklenen bölüm (F1.9) =====
-- audit_logs S sınıfı, yalnızca ekleme (data-model §4.1, US-057 AC3). app_user kaydı yazar
-- (aynı işlemde, AuditService); okuyamaz, güncelleyemez, silemez. RETURNING kullanılmaz;
-- bigserial için dizide USAGE gerekir. Okuma (F6.2) ayrı SECURITY DEFINER fonksiyonla gelir.
COMMENT ON TABLE "audit_logs" IS 'rls:S';
--> statement-breakpoint
REVOKE ALL ON TABLE "audit_logs" FROM PUBLIC;
--> statement-breakpoint
GRANT INSERT ON TABLE "audit_logs" TO app_user;
--> statement-breakpoint
GRANT USAGE ON SEQUENCE "audit_logs_id_seq" TO app_user;
--> statement-breakpoint
-- settings_put önceki değeri döner (US-017 AC2: audit'e eski değer). Dönüş tipi değiştiği için
-- CREATE OR REPLACE yetmez; DROP + CREATE. Gövde ve izinler 0000/0001 ile aynı, ek olarak
-- mevcut satır FOR UPDATE ile okunur. Satır yoksa NULL döner.
DROP FUNCTION settings_put(text, uuid, text, jsonb);
--> statement-breakpoint
CREATE FUNCTION settings_put(p_scope text, p_scope_id uuid, p_key text, p_value jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_previous jsonb;
BEGIN
  IF coalesce(current_setting('app.is_platform', true), '') <> 'true' THEN
    RAISE EXCEPTION 'settings_put yalnızca platform bağlamında çalışır'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT s.value INTO v_previous
    FROM public.settings s
   WHERE s.scope = p_scope
     AND coalesce(s.scope_id, '00000000-0000-0000-0000-000000000000'::uuid)
         = coalesce(p_scope_id, '00000000-0000-0000-0000-000000000000'::uuid)
     AND s.key = p_key
   FOR UPDATE;
  INSERT INTO public.settings (scope, scope_id, key, value, updated_by)
  VALUES (p_scope, p_scope_id, p_key, p_value, nullif(current_setting('app.user_id', true), '')::uuid)
  ON CONFLICT (scope, coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid), key)
  DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
  RETURN v_previous;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION settings_put(text, uuid, text, jsonb) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION settings_put(text, uuid, text, jsonb) TO app_user;
