-- Elle eklenen bölüm aşağıda; drizzle-kit bu dosyayı yeniden üretmez.
CREATE TABLE "notification_preferences" (
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"push_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_pk" PRIMARY KEY("user_id","type")
);
--> statement-breakpoint
CREATE TABLE "notification_templates" (
	"type" text NOT NULL,
	"lang" char(2) NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_templates_pk" PRIMARY KEY("type","lang")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"business_id" uuid,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"source_event_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"platform" text NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_tokens_token_uq" UNIQUE("token"),
	CONSTRAINT "push_tokens_platform_check" CHECK ("push_tokens"."platform" in ('ios', 'android'))
);
--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_lang_languages_code_fk" FOREIGN KEY ("lang") REFERENCES "public"."languages"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_user_id_idx" ON "notifications" USING btree ("user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_user_source_event_uq" ON "notifications" USING btree ("user_id","source_event_id");--> statement-breakpoint
CREATE INDEX "push_tokens_user_idx" ON "push_tokens" USING btree ("user_id");
--> statement-breakpoint
-- ===== Elle eklenen bölüm (F1.11) =====
-- push_tokens, notifications, notification_preferences U sınıfıdır (data-model §1.1, §4.16):
-- kullanıcı yalnızca kendi satırlarını görür. Worker alıcı adına withUserTx ile yazar.
-- notification_templates G sınıfıdır (F1.3 kalıbı). Silme yalnızca push_tokens'ta (kendi satırı;
-- DeviceNotRegistered). Token ekleme ve başka kullanıcıdan taşıma yalnızca push_token_register().
-- notifications.business_id → businesses FK'sı burada (şemada değil; modül bağımlılık yönü).
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_business_id_businesses_id_fk"
  FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id");
--> statement-breakpoint
CREATE INDEX "notifications_business_idx" ON "notifications" USING btree ("business_id")
  WHERE "business_id" IS NOT NULL;
--> statement-breakpoint
COMMENT ON TABLE "push_tokens" IS 'rls:U';
--> statement-breakpoint
ALTER TABLE "push_tokens" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "push_tokens" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "push_tokens" FROM PUBLIC;
--> statement-breakpoint
CREATE POLICY "push_tokens_self_select" ON "push_tokens" FOR SELECT
  USING ("user_id" = nullif(current_setting('app.user_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "push_tokens_self_delete" ON "push_tokens" FOR DELETE
  USING ("user_id" = nullif(current_setting('app.user_id', true), '')::uuid);
--> statement-breakpoint
-- push_token_register (sahibi migrator) için; app_user bu rolü üstlenemez.
CREATE POLICY "push_tokens_definer" ON "push_tokens" FOR ALL TO migrator
  USING (true) WITH CHECK (true);
--> statement-breakpoint
GRANT SELECT, DELETE ON TABLE "push_tokens" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "push_tokens" TO readonly;
--> statement-breakpoint
COMMENT ON TABLE "notifications" IS 'rls:U';
--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "notifications" FROM PUBLIC;
--> statement-breakpoint
CREATE POLICY "notifications_self_select" ON "notifications" FOR SELECT
  USING ("user_id" = nullif(current_setting('app.user_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "notifications_self_insert" ON "notifications" FOR INSERT
  WITH CHECK ("user_id" = nullif(current_setting('app.user_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "notifications_self_update" ON "notifications" FOR UPDATE
  USING ("user_id" = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK ("user_id" = nullif(current_setting('app.user_id', true), '')::uuid);
--> statement-breakpoint
-- Güncelleme yalnızca okundu bilgisi (kolon düzeyinde yetki).
GRANT SELECT, INSERT ON TABLE "notifications" TO app_user;
--> statement-breakpoint
GRANT UPDATE ("read_at") ON TABLE "notifications" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "notifications" TO readonly;
--> statement-breakpoint
COMMENT ON TABLE "notification_preferences" IS 'rls:U';
--> statement-breakpoint
ALTER TABLE "notification_preferences" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "notification_preferences" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "notification_preferences" FROM PUBLIC;
--> statement-breakpoint
CREATE POLICY "notification_preferences_self_select" ON "notification_preferences" FOR SELECT
  USING ("user_id" = nullif(current_setting('app.user_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "notification_preferences_self_insert" ON "notification_preferences" FOR INSERT
  WITH CHECK ("user_id" = nullif(current_setting('app.user_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "notification_preferences_self_update" ON "notification_preferences" FOR UPDATE
  USING ("user_id" = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK ("user_id" = nullif(current_setting('app.user_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "notification_preferences" TO app_user;
--> statement-breakpoint
GRANT UPDATE ("push_enabled", "updated_at") ON TABLE "notification_preferences" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "notification_preferences" TO readonly;
--> statement-breakpoint
COMMENT ON TABLE "notification_templates" IS 'rls:G';
--> statement-breakpoint
ALTER TABLE "notification_templates" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "notification_templates" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "notification_templates" FROM PUBLIC;
--> statement-breakpoint
CREATE POLICY "notification_templates_read" ON "notification_templates" FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY "notification_templates_platform_insert" ON "notification_templates" FOR INSERT
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
CREATE POLICY "notification_templates_platform_update" ON "notification_templates" FOR UPDATE
  USING (current_setting('app.is_platform', true) = 'true')
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
CREATE POLICY "notification_templates_platform_delete" ON "notification_templates" FOR DELETE
  USING (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "notification_templates" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "notification_templates" TO readonly;
--> statement-breakpoint
-- Cihaz anahtarını çağıran kullanıcıya kaydeder (US-054, openapi POST /push-tokens). Kullanıcı
-- parametreden değil app.user_id'den alınır; bağlam yoksa 42501. Aynı token başka kullanıcıdaysa
-- satır bu kullanıcıya taşınır (cihazda hesap değişti). Zaman uygulamanın Clock'undan gelir.
CREATE FUNCTION "push_token_register"(p_id uuid, p_token text, p_platform text, p_now timestamptz)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_user uuid := nullif(current_setting('app.user_id', true), '')::uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'push_token_register: kullanıcı bağlamı yok' USING ERRCODE = '42501';
  END IF;
  INSERT INTO push_tokens (id, user_id, token, platform, last_seen_at, created_at, updated_at)
  VALUES (p_id, v_user, p_token, p_platform, p_now, p_now, p_now)
  ON CONFLICT (token) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        platform = EXCLUDED.platform,
        last_seen_at = EXCLUDED.last_seen_at,
        updated_at = EXCLUDED.updated_at;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "push_token_register"(uuid, text, text, timestamptz) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "push_token_register"(uuid, text, text, timestamptz) TO app_user;
