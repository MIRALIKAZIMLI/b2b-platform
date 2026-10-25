-- Elle eklenen bölüm aşağıda; drizzle-kit bu dosyayı yeniden üretmez.
-- Elle sıra düzeltmesi: branches (business_id, id) benzersizliği, ona bağlanan bileşik FK'lardan önce.
ALTER TABLE "branches" ADD CONSTRAINT "branches_business_id_id_uq" UNIQUE("business_id","id");
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"phone_e164" text NOT NULL,
	"role_id" uuid NOT NULL,
	"job_title_id" uuid NOT NULL,
	"branch_id" uuid,
	"warehouse_id" uuid,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "job_titles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" jsonb NOT NULL,
	"capability" text NOT NULL,
	"role_template_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_titles_code_unique" UNIQUE("code"),
	CONSTRAINT "job_titles_capability_check" CHECK ("job_titles"."capability" in ('seller', 'buyer'))
);
--> statement-breakpoint
CREATE TABLE "membership_regions" (
	"membership_id" uuid NOT NULL,
	"region_id" uuid NOT NULL,
	CONSTRAINT "membership_regions_membership_id_region_id_pk" PRIMARY KEY("membership_id","region_id")
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"job_title_id" uuid NOT NULL,
	"branch_id" uuid,
	"warehouse_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_user_id_business_id_uq" UNIQUE("user_id","business_id"),
	CONSTRAINT "memberships_business_id_id_uq" UNIQUE("business_id","id"),
	CONSTRAINT "memberships_status_check" CHECK ("memberships"."status" in ('active', 'removed'))
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"code" text PRIMARY KEY NOT NULL,
	"capability" text NOT NULL,
	"module" text NOT NULL,
	"description" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "permissions_capability_check" CHECK ("permissions"."capability" in ('seller', 'buyer', 'any'))
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_code" text NOT NULL,
	"scope" text NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_code_pk" PRIMARY KEY("role_id","permission_code"),
	CONSTRAINT "role_permissions_scope_check" CHECK ("role_permissions"."scope" in ('all', 'branch', 'warehouse', 'assigned'))
);
--> statement-breakpoint
CREATE TABLE "role_template_permissions" (
	"template_id" uuid NOT NULL,
	"permission_code" text NOT NULL,
	"default_scope" text NOT NULL,
	CONSTRAINT "role_template_permissions_template_id_permission_code_pk" PRIMARY KEY("template_id","permission_code"),
	CONSTRAINT "role_template_permissions_scope_check" CHECK ("role_template_permissions"."default_scope" in ('all', 'branch', 'warehouse', 'assigned'))
);
--> statement-breakpoint
CREATE TABLE "role_templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" jsonb NOT NULL,
	"capability" text NOT NULL,
	"is_business_admin" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_templates_code_unique" UNIQUE("code"),
	CONSTRAINT "role_templates_capability_check" CHECK ("role_templates"."capability" in ('seller', 'buyer')),
	CONSTRAINT "role_templates_version_check" CHECK ("role_templates"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"name" jsonb NOT NULL,
	"capability" text NOT NULL,
	"is_business_admin" boolean DEFAULT false NOT NULL,
	"source_template_id" uuid,
	"source_template_version" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_business_id_id_uq" UNIQUE("business_id","id"),
	CONSTRAINT "roles_capability_check" CHECK ("roles"."capability" in ('seller', 'buyer'))
);
--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_job_title_id_job_titles_id_fk" FOREIGN KEY ("job_title_id") REFERENCES "public"."job_titles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_role_fk" FOREIGN KEY ("business_id","role_id") REFERENCES "public"."roles"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_branch_fk" FOREIGN KEY ("business_id","branch_id") REFERENCES "public"."branches"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_warehouse_fk" FOREIGN KEY ("business_id","warehouse_id") REFERENCES "public"."warehouses"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_titles" ADD CONSTRAINT "job_titles_role_template_id_role_templates_id_fk" FOREIGN KEY ("role_template_id") REFERENCES "public"."role_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_regions" ADD CONSTRAINT "membership_regions_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_regions" ADD CONSTRAINT "membership_regions_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_job_title_id_job_titles_id_fk" FOREIGN KEY ("job_title_id") REFERENCES "public"."job_titles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_role_fk" FOREIGN KEY ("business_id","role_id") REFERENCES "public"."roles"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_branch_fk" FOREIGN KEY ("business_id","branch_id") REFERENCES "public"."branches"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_warehouse_fk" FOREIGN KEY ("business_id","warehouse_id") REFERENCES "public"."warehouses"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_code_permissions_code_fk" FOREIGN KEY ("permission_code") REFERENCES "public"."permissions"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_template_permissions" ADD CONSTRAINT "role_template_permissions_template_id_role_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."role_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_template_permissions" ADD CONSTRAINT "role_template_permissions_permission_code_permissions_code_fk" FOREIGN KEY ("permission_code") REFERENCES "public"."permissions"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_source_template_id_role_templates_id_fk" FOREIGN KEY ("source_template_id") REFERENCES "public"."role_templates"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- ===== Elle eklenen bölüm (F1.8a) =====
-- G (permissions, role_templates, role_template_permissions, job_titles): F1.3 kalıbı; herkes okur,
-- yazma yalnızca platform bağlamında. T (roles, memberships, invitations): F1.1 kalıbı + platform
-- politikası (US-016 AC5 yasak listesinde değiller). role_permissions ve membership_regions
-- business_id taşımaz: politika üst satırın (roles / memberships) görünür olmasını EXISTS ile ister;
-- üst tablonun RLS'i süzer. Kullanıcının tüm işletmelerdeki üyelikleri list_my_memberships()
-- (SECURITY DEFINER) ile okunur; app_user için T kuralına ek politika yok (Mimar K1).
COMMENT ON TABLE "permissions" IS 'rls:G';
--> statement-breakpoint
COMMENT ON TABLE "role_templates" IS 'rls:G';
--> statement-breakpoint
COMMENT ON TABLE "role_template_permissions" IS 'rls:G';
--> statement-breakpoint
COMMENT ON TABLE "job_titles" IS 'rls:G';
--> statement-breakpoint
COMMENT ON TABLE "roles" IS 'rls:T';
--> statement-breakpoint
COMMENT ON TABLE "role_permissions" IS 'rls:T';
--> statement-breakpoint
COMMENT ON TABLE "memberships" IS 'rls:T';
--> statement-breakpoint
COMMENT ON TABLE "membership_regions" IS 'rls:T';
--> statement-breakpoint
COMMENT ON TABLE "invitations" IS 'rls:T';
--> statement-breakpoint
ALTER TABLE "permissions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "permissions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "permissions" FROM PUBLIC;
--> statement-breakpoint
CREATE POLICY "permissions_read" ON "permissions" FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY "permissions_platform_insert" ON "permissions" FOR INSERT
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
CREATE POLICY "permissions_platform_update" ON "permissions" FOR UPDATE
  USING (current_setting('app.is_platform', true) = 'true')
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
CREATE POLICY "permissions_platform_delete" ON "permissions" FOR DELETE
  USING (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "permissions" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "permissions" TO readonly;
--> statement-breakpoint
ALTER TABLE "role_templates" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "role_templates" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "role_templates" FROM PUBLIC;
--> statement-breakpoint
CREATE POLICY "role_templates_read" ON "role_templates" FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY "role_templates_platform_insert" ON "role_templates" FOR INSERT
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
CREATE POLICY "role_templates_platform_update" ON "role_templates" FOR UPDATE
  USING (current_setting('app.is_platform', true) = 'true')
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
CREATE POLICY "role_templates_platform_delete" ON "role_templates" FOR DELETE
  USING (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "role_templates" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "role_templates" TO readonly;
--> statement-breakpoint
ALTER TABLE "role_template_permissions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "role_template_permissions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "role_template_permissions" FROM PUBLIC;
--> statement-breakpoint
CREATE POLICY "role_template_permissions_read" ON "role_template_permissions" FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY "role_template_permissions_platform_insert" ON "role_template_permissions" FOR INSERT
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
CREATE POLICY "role_template_permissions_platform_update" ON "role_template_permissions" FOR UPDATE
  USING (current_setting('app.is_platform', true) = 'true')
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
CREATE POLICY "role_template_permissions_platform_delete" ON "role_template_permissions" FOR DELETE
  USING (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "role_template_permissions" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "role_template_permissions" TO readonly;
--> statement-breakpoint
ALTER TABLE "job_titles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "job_titles" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "job_titles" FROM PUBLIC;
--> statement-breakpoint
CREATE POLICY "job_titles_read" ON "job_titles" FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY "job_titles_platform_insert" ON "job_titles" FOR INSERT
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
CREATE POLICY "job_titles_platform_update" ON "job_titles" FOR UPDATE
  USING (current_setting('app.is_platform', true) = 'true')
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
CREATE POLICY "job_titles_platform_delete" ON "job_titles" FOR DELETE
  USING (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "job_titles" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "job_titles" TO readonly;
--> statement-breakpoint
ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "roles" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "roles" FROM PUBLIC;
--> statement-breakpoint
CREATE POLICY "roles_tenant" ON "roles" FOR ALL
  USING ("business_id" = nullif(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK ("business_id" = nullif(current_setting('app.business_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "roles_platform" ON "roles" FOR ALL
  USING (current_setting('app.is_platform', true) = 'true')
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "roles" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "roles" TO readonly;
--> statement-breakpoint
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "memberships" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "memberships" FROM PUBLIC;
--> statement-breakpoint
CREATE POLICY "memberships_tenant" ON "memberships" FOR ALL
  USING ("business_id" = nullif(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK ("business_id" = nullif(current_setting('app.business_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "memberships_platform" ON "memberships" FOR ALL
  USING (current_setting('app.is_platform', true) = 'true')
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "memberships" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "memberships" TO readonly;
--> statement-breakpoint
ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "invitations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "invitations" FROM PUBLIC;
--> statement-breakpoint
CREATE POLICY "invitations_tenant" ON "invitations" FOR ALL
  USING ("business_id" = nullif(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK ("business_id" = nullif(current_setting('app.business_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "invitations_platform" ON "invitations" FOR ALL
  USING (current_setting('app.is_platform', true) = 'true')
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "invitations" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "invitations" TO readonly;
--> statement-breakpoint
ALTER TABLE "role_permissions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "role_permissions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "role_permissions" FROM PUBLIC;
--> statement-breakpoint
CREATE POLICY "role_permissions_parent" ON "role_permissions" FOR ALL
  USING (EXISTS (SELECT 1 FROM "roles" p WHERE p.id = "role_permissions"."role_id"))
  WITH CHECK (EXISTS (SELECT 1 FROM "roles" p WHERE p.id = "role_permissions"."role_id"));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "role_permissions" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "role_permissions" TO readonly;
--> statement-breakpoint
ALTER TABLE "membership_regions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "membership_regions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "membership_regions" FROM PUBLIC;
--> statement-breakpoint
CREATE POLICY "membership_regions_parent" ON "membership_regions" FOR ALL
  USING (EXISTS (SELECT 1 FROM "memberships" p WHERE p.id = "membership_regions"."membership_id"))
  WITH CHECK (EXISTS (SELECT 1 FROM "memberships" p WHERE p.id = "membership_regions"."membership_id"));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "membership_regions" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "membership_regions" TO readonly;
--> statement-breakpoint
-- Son admin koruması (F1.8-AC4, US-013 AC3, data-model §4.5). Bir işletmede `active` ve
-- is_business_admin rollü son üyeliği kaldıran, pasifleştiren, silen veya rolünü değiştiren işlem;
-- ya da son admin rolünün admin bayrağını kapatan işlem reddedilir (SQLSTATE AC001, mesaj
-- LAST_ADMIN_PROTECTED; repository DomainError'a çevirir). Eşzamanlı iki kaldırma işletme başına
-- işlem kilidiyle (pg_advisory_xact_lock) sıraya girer; kilitten sonraki sayım yeni anlık
-- görüntüyle yapılır (READ COMMITTED; plpgsql her sorguda yeni snapshot alır). SECURITY INVOKER:
-- yazmaya izin veren bağlam (kiracı veya platform) işletmenin satırlarını zaten görür.
-- İlk üyelik (INSERT) denetlenmez; işletme, admin üyeliğiyle birlikte açılır (F2.1).
CREATE FUNCTION "access_assert_business_has_admin"(p_business_id uuid) RETURNS void
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('access.last_admin:' || p_business_id::text, 0));
  IF NOT EXISTS (
    SELECT 1
      FROM public.memberships m
      JOIN public.roles r ON r.id = m.role_id
     WHERE m.business_id = p_business_id
       AND m.status = 'active'
       AND r.is_business_admin
  ) THEN
    RAISE EXCEPTION 'LAST_ADMIN_PROTECTED' USING ERRCODE = 'AC001';
  END IF;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "access_assert_business_has_admin"(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "access_assert_business_has_admin"(uuid) TO app_user;
--> statement-breakpoint
CREATE FUNCTION "memberships_last_admin_guard"() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  was_admin boolean;
BEGIN
  IF OLD.status <> 'active' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.status = OLD.status
     AND NEW.role_id = OLD.role_id
     AND NEW.business_id = OLD.business_id THEN
    RETURN NULL;
  END IF;
  SELECT r.is_business_admin INTO was_admin FROM public.roles r WHERE r.id = OLD.role_id;
  IF coalesce(was_admin, false) THEN
    PERFORM public.access_assert_business_has_admin(OLD.business_id);
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "memberships_last_admin_guard"() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER "memberships_last_admin_guard"
  AFTER UPDATE OR DELETE ON "memberships"
  FOR EACH ROW EXECUTE FUNCTION "memberships_last_admin_guard"();
--> statement-breakpoint
CREATE FUNCTION "roles_last_admin_guard"() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF OLD.is_business_admin
     AND (NOT NEW.is_business_admin OR NEW.business_id <> OLD.business_id) THEN
    PERFORM public.access_assert_business_has_admin(OLD.business_id);
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "roles_last_admin_guard"() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER "roles_last_admin_guard"
  AFTER UPDATE ON "roles"
  FOR EACH ROW EXECUTE FUNCTION "roles_last_admin_guard"();
--> statement-breakpoint
-- Kullanıcının kendi aktif üyelikleri, tüm işletmelerde (/me, işletme seçici; Mimar K1).
-- migrator sahipli SECURITY DEFINER. FORCE RLS tablo sahibine de uygulandığı için yalnızca
-- migrator'a verilen ve yalnızca app.user_id'nin satırlarını açan SELECT politikası eklenir;
-- app_user bu politikadan yararlanamaz, tabloya doğrudan sorgusu T kuralına tabidir.
CREATE POLICY "memberships_self_definer" ON "memberships" FOR SELECT TO migrator
  USING ("user_id" = nullif(current_setting('app.user_id', true), '')::uuid);
--> statement-breakpoint
CREATE FUNCTION list_my_memberships()
RETURNS TABLE (
  membership_id uuid,
  business_id uuid,
  role_id uuid,
  job_title_id uuid,
  branch_id uuid,
  warehouse_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT m.id, m.business_id, m.role_id, m.job_title_id, m.branch_id, m.warehouse_id
    FROM public.memberships m
   WHERE m.user_id = nullif(current_setting('app.user_id', true), '')::uuid
     AND m.status = 'active'
   ORDER BY m.joined_at, m.id;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION list_my_memberships() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION list_my_memberships() TO app_user;
