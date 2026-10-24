-- Elle eklenen bölüm aşağıda; drizzle-kit bu dosyayı yeniden üretmez.
CREATE TABLE "settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"scope_id" uuid,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_scope_check" CHECK ("settings"."scope" in ('platform', 'plan', 'business')),
	CONSTRAINT "settings_scope_id_check" CHECK (("settings"."scope" = 'platform') = ("settings"."scope_id" is null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "settings_scope_key_uq" ON "settings" USING btree ("scope",coalesce("scope_id", '00000000-0000-0000-0000-000000000000'::uuid),"key");
--> statement-breakpoint
-- ===== Elle eklenen bölüm (F1.4a) =====
-- settings S sınıfıdır (data-model §1.1, §4.3): app_user'ın tabloda hiçbir izni yoktur.
-- Okuma ve yazma migrator sahipli SECURITY DEFINER fonksiyonlarla yapılır. Bu kalıp sonraki
-- S tablolarının (outbox, idempotens, OTP, audit) örneğidir (F1 faz spesifikasyonu §6.6).
COMMENT ON TABLE "settings" IS 'rls:S';
--> statement-breakpoint
REVOKE ALL ON TABLE "settings" FROM PUBLIC;
--> statement-breakpoint
-- Platform satırı ve (p_business_id verilmişse) işletme satırı. İşletme satırı yalnızca
-- p_business_id işlemin kiracısıyla (app.business_id) aynıysa veya platform bağlamında döner.
CREATE FUNCTION settings_get(p_key text, p_business_id uuid)
RETURNS TABLE (scope text, value jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT s.scope, s.value
    FROM public.settings s
   WHERE s.key = p_key
     AND (
       s.scope = 'platform'
       OR (
         s.scope = 'business'
         AND p_business_id IS NOT NULL
         AND s.scope_id = p_business_id
         AND (
           p_business_id = nullif(current_setting('app.business_id', true), '')::uuid
           OR current_setting('app.is_platform', true) = 'true'
         )
       )
     );
$$;
--> statement-breakpoint
-- Yalnızca platform bağlamında yazar; updated_by işlemin kullanıcısıdır (app.user_id).
-- Değer doğrulaması uygulamada (SettingsService, @b2b/shared ayar kaydı).
CREATE FUNCTION settings_put(p_scope text, p_scope_id uuid, p_key text, p_value jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF coalesce(current_setting('app.is_platform', true), '') <> 'true' THEN
    RAISE EXCEPTION 'settings_put yalnızca platform bağlamında çalışır'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO public.settings (scope, scope_id, key, value, updated_by)
  VALUES (p_scope, p_scope_id, p_key, p_value, nullif(current_setting('app.user_id', true), '')::uuid)
  ON CONFLICT (scope, coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid), key)
  DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION settings_get(text, uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION settings_put(text, uuid, text, jsonb) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION settings_get(text, uuid) TO app_user;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION settings_put(text, uuid, text, jsonb) TO app_user;
