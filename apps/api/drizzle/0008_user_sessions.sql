-- Elle eklenen bölüm aşağıda; drizzle-kit bu dosyayı yeniden üretmez.
CREATE TABLE "user_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"refresh_token_hash" text NOT NULL,
	"family_id" uuid NOT NULL,
	"device_type" text NOT NULL,
	"device_name" text,
	"ip_city" text,
	"last_used_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"impersonation_session_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_sessions_refresh_token_hash_uq" UNIQUE("refresh_token_hash"),
	CONSTRAINT "user_sessions_device_type_check" CHECK ("user_sessions"."device_type" in ('web', 'ios', 'android'))
);
--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_sessions_user_idx" ON "user_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_sessions_family_idx" ON "user_sessions" USING btree ("family_id");
--> statement-breakpoint
-- ===== Elle eklenen bölüm (F1.5b) =====
-- user_sessions U sınıfıdır: kullanıcı yalnızca kendi oturumlarını görür, açar ve kapatır; platform
-- bağlamı her şeyi yapar; silme yok. Kullanıcı bağlamı olmayan akışlar (OTP doğrulaması, yenileme)
-- migrator sahipli SECURITY DEFINER fonksiyonlarla çalışır (search_path pg_temp en sonda, PUBLIC
-- çalıştıramaz). Zaman uygulamanın Clock'undan parametre olarak gelir.
COMMENT ON TABLE "user_sessions" IS 'rls:U';
--> statement-breakpoint
ALTER TABLE "user_sessions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "user_sessions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "user_sessions_self_select" ON "user_sessions" FOR SELECT
  USING ("user_id" = nullif(current_setting('app.user_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "user_sessions_self_insert" ON "user_sessions" FOR INSERT
  WITH CHECK ("user_id" = nullif(current_setting('app.user_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "user_sessions_self_update" ON "user_sessions" FOR UPDATE
  USING ("user_id" = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK ("user_id" = nullif(current_setting('app.user_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "user_sessions_platform" ON "user_sessions" FOR ALL
  USING (current_setting('app.is_platform', true) = 'true')
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
-- SECURITY DEFINER fonksiyonları (sahibi migrator) kullanıcı bağlamı olmadan çalışır (OTP doğrulaması,
-- yenileme); tablolar FORCE RLS olduğu için yalnızca migrator rolüne açık politikalar gerekir.
-- app_user bu rolü üstlenemez; politikalar yalnızca bu fonksiyonların içinde etkilidir.
CREATE POLICY "user_sessions_definer" ON "user_sessions" FOR ALL TO migrator
  USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "users_definer_select" ON "users" FOR SELECT TO migrator USING (true);
--> statement-breakpoint
CREATE POLICY "users_definer_update" ON "users" FOR UPDATE TO migrator
  USING (true) WITH CHECK (true);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "user_sessions" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "user_sessions" TO readonly;
--> statement-breakpoint
-- user_sessions alan koruması: platform dışında app_user yeni oturumu yalnızca açık (revoked_at
-- boş) ekler; güncellemede yalnızca oturumu kapatabilir (revoked_at boş → dolu, updated_at).
-- Anahtar özeti, aile, süre, cihaz değiştirilemez; kapatılmış oturum yeniden açılamaz. İhlal 42501.
-- SECURITY DEFINER fonksiyonları (sahibi migrator) bu kurala tabi değildir.
CREATE FUNCTION "user_sessions_guard_columns"() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF current_setting('app.is_platform', true) = 'true' OR current_user = 'migrator' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.revoked_at IS NOT NULL OR NEW.impersonation_session_id IS NOT NULL THEN
      RAISE EXCEPTION 'user_sessions: bu alanlar yalnızca platform bağlamında ayarlanabilir'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at)
     OR (OLD.revoked_at IS NULL AND NEW.revoked_at IS NULL AND NEW.updated_at IS DISTINCT FROM OLD.updated_at)
     OR NEW.refresh_token_hash IS DISTINCT FROM OLD.refresh_token_hash
     OR NEW.family_id IS DISTINCT FROM OLD.family_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.last_used_at IS DISTINCT FROM OLD.last_used_at
     OR NEW.device_type IS DISTINCT FROM OLD.device_type
     OR NEW.device_name IS DISTINCT FROM OLD.device_name
     OR NEW.ip_city IS DISTINCT FROM OLD.ip_city
     OR NEW.impersonation_session_id IS DISTINCT FROM OLD.impersonation_session_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'user_sessions: oturum yalnızca kapatılabilir'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "user_sessions_guard_columns"() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER "user_sessions_guard_columns"
  BEFORE INSERT OR UPDATE ON "user_sessions"
  FOR EACH ROW EXECUTE FUNCTION "user_sessions_guard_columns"();
--> statement-breakpoint
-- users alan koruması (0007) güncellenir: SECURITY DEFINER fonksiyonlarının (sahibi migrator)
-- yazmasına izin verilir; app_user platform dışında phone_e164, status, last_login_at alanlarını
-- yine değiştiremez (F1.5b, Mimar kararı 5).
CREATE OR REPLACE FUNCTION "users_guard_platform_columns"() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF current_setting('app.is_platform', true) = 'true' OR current_user = 'migrator' THEN
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
-- OTP doğrulamasından sonra numaranın kullanıcısı (henüz kullanıcı bağlamı yok). Yoksa 0 satır.
CREATE FUNCTION identity_user_by_phone(p_phone_e164 text)
RETURNS TABLE (id uuid, status text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT u.id, u.status FROM public.users u WHERE u.phone_e164 = p_phone_e164;
$$;
--> statement-breakpoint
-- Başarılı girişte users.last_login_at (Mimar kararı 5).
CREATE FUNCTION identity_record_login(p_user_id uuid, p_now timestamptz)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  UPDATE public.users u SET last_login_at = p_now, updated_at = p_now WHERE u.id = p_user_id;
$$;
--> statement-breakpoint
-- Yenileme anahtarını döndürür (tek işlem, satır kilidi; Mimar kararı K3). Sonuç:
--   rotated  : eski satır kapatıldı, aynı ailede yeni satır (p_new_id) açıldı
--   reused   : anahtarın satırı zaten kapalı → ailenin açık satırları da kapatıldı
--   unknown  : anahtar yok
--   expired  : süresi dolmuş
--   disabled : kullanıcı aktif değil → aile kapatıldı
-- Aynı anahtarla eşzamanlı iki çağrıda ikincisi kilidi bekler, kapatılmış satırı görür: reused.
CREATE FUNCTION user_session_rotate(
  p_refresh_token_hash text,
  p_new_id uuid,
  p_new_refresh_token_hash text,
  p_now timestamptz,
  p_new_expires_at timestamptz
)
RETURNS TABLE (result text, user_id uuid, session_id uuid, family_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  s public.user_sessions%ROWTYPE;
  user_status text;
BEGIN
  SELECT * INTO s
    FROM public.user_sessions us
   WHERE us.refresh_token_hash = p_refresh_token_hash
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'unknown'::text, NULL::uuid, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  IF s.revoked_at IS NOT NULL THEN
    UPDATE public.user_sessions us
       SET revoked_at = p_now, updated_at = p_now
     WHERE us.family_id = s.family_id AND us.revoked_at IS NULL;
    RETURN QUERY SELECT 'reused'::text, s.user_id, s.id, s.family_id;
    RETURN;
  END IF;

  IF s.expires_at <= p_now THEN
    RETURN QUERY SELECT 'expired'::text, s.user_id, s.id, s.family_id;
    RETURN;
  END IF;

  SELECT u.status INTO user_status FROM public.users u WHERE u.id = s.user_id;
  IF user_status IS DISTINCT FROM 'active' THEN
    UPDATE public.user_sessions us
       SET revoked_at = p_now, updated_at = p_now
     WHERE us.family_id = s.family_id AND us.revoked_at IS NULL;
    RETURN QUERY SELECT 'disabled'::text, s.user_id, s.id, s.family_id;
    RETURN;
  END IF;

  UPDATE public.user_sessions us SET revoked_at = p_now, updated_at = p_now WHERE us.id = s.id;
  INSERT INTO public.user_sessions
         (id, user_id, refresh_token_hash, family_id, device_type, device_name, ip_city,
          last_used_at, expires_at, revoked_at, impersonation_session_id, created_at, updated_at)
  VALUES (p_new_id, s.user_id, p_new_refresh_token_hash, s.family_id, s.device_type,
          s.device_name, s.ip_city, p_now, p_new_expires_at, NULL, s.impersonation_session_id,
          p_now, p_now);
  RETURN QUERY SELECT 'rotated'::text, s.user_id, p_new_id, s.family_id;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION identity_user_by_phone(text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION identity_record_login(uuid, timestamptz) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION user_session_rotate(text, uuid, text, timestamptz, timestamptz) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION identity_user_by_phone(text) TO app_user;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION identity_record_login(uuid, timestamptz) TO app_user;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION user_session_rotate(text, uuid, text, timestamptz, timestamptz) TO app_user;
