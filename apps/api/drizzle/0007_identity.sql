-- Elle eklenen bölüm aşağıda; drizzle-kit bu dosyayı yeniden üretmez.
CREATE TABLE "dev_sms_outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"phone_e164" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_challenges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"phone_e164" text NOT NULL,
	"purpose" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"consumed_at" timestamp with time zone,
	"request_ip" "inet",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "otp_challenges_purpose_check" CHECK ("otp_challenges"."purpose" in ('login', 'register', 'invitation'))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"phone_e164" text NOT NULL,
	"full_name" text NOT NULL,
	"preferred_language" char(2),
	"timezone" text,
	"status" text DEFAULT 'active' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_e164_uq" UNIQUE("phone_e164"),
	CONSTRAINT "users_status_check" CHECK ("users"."status" in ('active', 'locked', 'deleted'))
);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_preferred_language_languages_code_fk" FOREIGN KEY ("preferred_language") REFERENCES "public"."languages"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dev_sms_outbox_phone_created_idx" ON "dev_sms_outbox" USING btree ("phone_e164","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "otp_challenges_phone_created_idx" ON "otp_challenges" USING btree ("phone_e164","created_at" DESC NULLS LAST);--> statement-breakpoint
-- ===== Elle eklenen bölüm (F1.5a) =====
-- Önceki adımlarda FK'sız bırakılan kullanıcı sütunlarına users FK'sı (data-model §4.2). Drizzle
-- şemasında yok: şemadan identity modülünü içe aktarmak modüller arası döngü yaratır.
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id");
--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id");
--> statement-breakpoint
ALTER TABLE "business_capabilities" ADD CONSTRAINT "business_capabilities_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id");
--> statement-breakpoint
ALTER TABLE "entitlement_overrides" ADD CONSTRAINT "entitlement_overrides_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");
--> statement-breakpoint
-- users U sınıfıdır: kullanıcı yalnızca kendi satırını görür ve günceller; platform bağlamı her
-- şeyi yapar. Üyelik üzerinden görme politikası memberships ile (F1.8) gelir. Silme yok (status).
-- otp_challenges ve dev_sms_outbox S sınıfıdır: app_user'ın tablo izni yok; erişim yalnızca
-- migrator sahipli SECURITY DEFINER fonksiyonlarla (search_path pg_temp en sonda, PUBLIC çalıştıramaz).
-- Zaman uygulamanın Clock'undan parametre olarak gelir (coding-guidelines §3.10).
COMMENT ON TABLE "users" IS 'rls:U';
--> statement-breakpoint
COMMENT ON TABLE "otp_challenges" IS 'rls:S';
--> statement-breakpoint
COMMENT ON TABLE "dev_sms_outbox" IS 'rls:S';
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "users_self_select" ON "users" FOR SELECT
  USING ("id" = nullif(current_setting('app.user_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "users_self_update" ON "users" FOR UPDATE
  USING ("id" = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK ("id" = nullif(current_setting('app.user_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "users_platform" ON "users" FOR ALL
  USING (current_setting('app.is_platform', true) = 'true')
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "users" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "users" TO readonly;
--> statement-breakpoint
-- users alan koruması (businesses_guard_platform_columns kalıbı, Müfettiş D1): phone_e164, status ve
-- last_login_at yalnızca platform bağlamında değişir. Kullanıcı kendi satırında bu alanları
-- değiştiremez (ör. platform kilidini kaldıramaz, doğrulanmamış bir numarayı sahiplenemez).
-- İhlal 42501. Ekleme zaten yalnızca platform politikasıyla mümkündür. Fonksiyon SECURITY
-- DEFINER değildir (tablo okumaz); search_path sabittir.
CREATE FUNCTION "users_guard_platform_columns"() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF current_setting('app.is_platform', true) = 'true' THEN
    RETURN NEW;
  END IF;
  IF NEW.phone_e164 IS DISTINCT FROM OLD.phone_e164
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.last_login_at IS DISTINCT FROM OLD.last_login_at THEN
    RAISE EXCEPTION 'users: bu alanlar yalnızca platform bağlamında değiştirilebilir'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "users_guard_platform_columns"() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER "users_guard_platform_columns"
  BEFORE UPDATE ON "users"
  FOR EACH ROW EXECUTE FUNCTION "users_guard_platform_columns"();
--> statement-breakpoint
REVOKE ALL ON TABLE "otp_challenges" FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON TABLE "dev_sms_outbox" FROM PUBLIC;
--> statement-breakpoint
CREATE FUNCTION otp_challenge_create(
  p_id uuid,
  p_phone_e164 text,
  p_purpose text,
  p_code_hash text,
  p_expires_at timestamptz,
  p_request_ip inet,
  p_now timestamptz
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  INSERT INTO public.otp_challenges
         (id, phone_e164, purpose, code_hash, expires_at, request_ip, created_at, updated_at)
  VALUES (p_id, p_phone_e164, p_purpose, p_code_hash, p_expires_at, p_request_ip, p_now, p_now);
$$;
--> statement-breakpoint
-- Doğrulama için satırı kilitler (FOR UPDATE, çağıran işlem bitene kadar) ve döner; yoksa 0 satır.
-- Kod karşılaştırması uygulamada sabit zamanlı yapılır (HMAC anahtarı veritabanında değil).
CREATE FUNCTION otp_challenge_lock(p_id uuid)
RETURNS TABLE (
  phone_e164 text,
  purpose text,
  code_hash text,
  expires_at timestamptz,
  attempts smallint,
  consumed_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT c.phone_e164, c.purpose, c.code_hash, c.expires_at, c.attempts, c.consumed_at
    FROM public.otp_challenges c
   WHERE c.id = p_id
   FOR UPDATE;
$$;
--> statement-breakpoint
-- Yanlış denemeyi sayar; yeni deneme sayısını döner.
CREATE FUNCTION otp_challenge_fail(p_id uuid, p_now timestamptz)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  UPDATE public.otp_challenges c
     SET attempts = c.attempts + 1,
         updated_at = p_now
   WHERE c.id = p_id
  RETURNING c.attempts::integer;
$$;
--> statement-breakpoint
-- Challenge'ı kapatır (doğru kod, kilit veya SMS hatası): bir daha kullanılamaz.
CREATE FUNCTION otp_challenge_close(p_id uuid, p_now timestamptz)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  UPDATE public.otp_challenges c
     SET consumed_at = p_now,
         updated_at = p_now
   WHERE c.id = p_id AND c.consumed_at IS NULL;
$$;
--> statement-breakpoint
CREATE FUNCTION dev_sms_outbox_insert(p_id uuid, p_phone_e164 text, p_body text, p_now timestamptz)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  INSERT INTO public.dev_sms_outbox (id, phone_e164, body, created_at)
  VALUES (p_id, p_phone_e164, p_body, p_now);
$$;
--> statement-breakpoint
-- Son mesajlar (en yeni önce); p_phone_e164 null ise tüm numaralar.
CREATE FUNCTION dev_sms_outbox_list(p_phone_e164 text, p_limit integer)
RETURNS TABLE (id uuid, phone_e164 text, body text, created_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT o.id, o.phone_e164, o.body, o.created_at
    FROM public.dev_sms_outbox o
   WHERE p_phone_e164 IS NULL OR o.phone_e164 = p_phone_e164
   ORDER BY o.created_at DESC, o.id DESC
   LIMIT p_limit;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION otp_challenge_create(uuid, text, text, text, timestamptz, inet, timestamptz) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION otp_challenge_lock(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION otp_challenge_fail(uuid, timestamptz) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION otp_challenge_close(uuid, timestamptz) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION dev_sms_outbox_insert(uuid, text, text, timestamptz) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION dev_sms_outbox_list(text, integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION otp_challenge_create(uuid, text, text, text, timestamptz, inet, timestamptz) TO app_user;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION otp_challenge_lock(uuid) TO app_user;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION otp_challenge_fail(uuid, timestamptz) TO app_user;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION otp_challenge_close(uuid, timestamptz) TO app_user;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION dev_sms_outbox_insert(uuid, text, text, timestamptz) TO app_user;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION dev_sms_outbox_list(text, integer) TO app_user;
