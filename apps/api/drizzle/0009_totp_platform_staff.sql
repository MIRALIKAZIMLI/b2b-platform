-- Elle eklenen bölüm aşağıda; drizzle-kit bu dosyayı yeniden üretmez.
CREATE TABLE "platform_staff" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_staff_role_check" CHECK ("platform_staff"."role" in ('super_admin', 'operations', 'support', 'content'))
);
--> statement-breakpoint
CREATE TABLE "user_totp" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"secret_encrypted" "bytea" NOT NULL,
	"recovery_codes_hash" jsonb NOT NULL,
	"enabled_at" timestamp with time zone,
	"last_used_step" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "platform_staff" ADD CONSTRAINT "platform_staff_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_totp" ADD CONSTRAINT "user_totp_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- ===== Elle eklenen bölüm (F1.6) =====
-- user_totp U sınıfıdır: kullanıcı yalnızca kendi satırını okur, ekler, günceller; platform her şey;
-- silme yok. platform_staff S sınıfıdır: app_user'ın tablo izni yok; rol platform_staff_role()
-- SECURITY DEFINER fonksiyonuyla okunur (search_path pg_temp en sonda, PUBLIC çalıştıramaz).
COMMENT ON TABLE "user_totp" IS 'rls:U';
--> statement-breakpoint
COMMENT ON TABLE "platform_staff" IS 'rls:S';
--> statement-breakpoint
ALTER TABLE "user_totp" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "user_totp" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "user_totp_self_select" ON "user_totp" FOR SELECT
  USING ("user_id" = nullif(current_setting('app.user_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "user_totp_self_insert" ON "user_totp" FOR INSERT
  WITH CHECK ("user_id" = nullif(current_setting('app.user_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "user_totp_self_update" ON "user_totp" FOR UPDATE
  USING ("user_id" = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK ("user_id" = nullif(current_setting('app.user_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "user_totp_platform" ON "user_totp" FOR ALL
  USING (current_setting('app.is_platform', true) = 'true')
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "user_totp" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "user_totp" TO readonly;
--> statement-breakpoint
REVOKE ALL ON TABLE "platform_staff" FROM PUBLIC;
--> statement-breakpoint
-- user_totp alan koruması: platform dışında, etkinleşmiş (enabled_at dolu) TOTP'nin sırrı ve
-- etkinlik zamanı değiştirilemez, kapatılamaz (kullanıcı kendi ikinci adımını kaldıramaz). Etkin
-- kurulumda yalnızca kurtarma kodu kullanımı ve son adım güncellenir. İhlal 42501. İstisna yalnızca
-- platform bağlamı ve fonksiyon sahibi (migrator).
CREATE FUNCTION "user_totp_guard_columns"() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF current_setting('app.is_platform', true) = 'true' OR current_user = 'migrator' THEN
    RETURN NEW;
  END IF;
  IF OLD.enabled_at IS NOT NULL AND (
       NEW.enabled_at IS DISTINCT FROM OLD.enabled_at
       OR NEW.secret_encrypted IS DISTINCT FROM OLD.secret_encrypted
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
     ) THEN
    RAISE EXCEPTION 'user_totp: etkin TOTP yalnızca platform bağlamında değiştirilebilir'
      USING ERRCODE = '42501';
  END IF;
  IF OLD.last_used_step IS NOT NULL AND (
       NEW.last_used_step IS NULL OR NEW.last_used_step < OLD.last_used_step
     ) THEN
    RAISE EXCEPTION 'user_totp: son kullanılan adım geri alınamaz'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "user_totp_guard_columns"() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER "user_totp_guard_columns"
  BEFORE UPDATE ON "user_totp"
  FOR EACH ROW EXECUTE FUNCTION "user_totp_guard_columns"();
--> statement-breakpoint
-- Kullanıcının aktif platform rolü; yoksa null (OTP doğrulamasında, kullanıcı bağlamından önce).
CREATE FUNCTION platform_staff_role(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT ps.role FROM public.platform_staff ps WHERE ps.user_id = p_user_id AND ps.is_active;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION platform_staff_role(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION platform_staff_role(uuid) TO app_user;
