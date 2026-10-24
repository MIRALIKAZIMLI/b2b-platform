-- Elle eklenen bölüm aşağıda; drizzle-kit bu dosyayı yeniden üretmez.
CREATE TABLE "activity_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"region_id" uuid,
	"address_line" text NOT NULL,
	"geo_lat" numeric(9, 6),
	"geo_lng" numeric(9, 6),
	"approval_rule" text DEFAULT 'every_order' NOT NULL,
	"approval_threshold" numeric(14, 2),
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branches_approval_rule_check" CHECK ("branches"."approval_rule" in ('every_order', 'above_amount', 'none')),
	CONSTRAINT "branches_approval_threshold_check" CHECK ("branches"."approval_rule" <> 'above_amount' or "branches"."approval_threshold" is not null),
	CONSTRAINT "branches_status_check" CHECK ("branches"."status" in ('active', 'inactive'))
);
--> statement-breakpoint
CREATE TABLE "business_capabilities" (
	"business_id" uuid NOT NULL,
	"capability" text NOT NULL,
	"status" text NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_capabilities_business_id_capability_pk" PRIMARY KEY("business_id","capability"),
	CONSTRAINT "business_capabilities_capability_check" CHECK ("business_capabilities"."capability" in ('seller', 'buyer')),
	CONSTRAINT "business_capabilities_status_check" CHECK ("business_capabilities"."status" in ('pending', 'approved', 'suspended'))
);
--> statement-breakpoint
CREATE TABLE "business_privacy" (
	"business_id" uuid PRIMARY KEY NOT NULL,
	"show_logo" boolean DEFAULT false NOT NULL,
	"show_address" boolean DEFAULT false NOT NULL,
	"show_business_phone" boolean DEFAULT false NOT NULL,
	"show_voen" boolean DEFAULT false NOT NULL,
	"show_contact_name" boolean DEFAULT false NOT NULL,
	"show_personal_contact" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"legal_name" text NOT NULL,
	"voen" char(10),
	"legal_type" text,
	"country_code" char(2) DEFAULT 'AZ' NOT NULL,
	"region_id" uuid NOT NULL,
	"address_line" text,
	"geo_lat" numeric(9, 6),
	"geo_lng" numeric(9, 6),
	"business_phone" text,
	"logo_file_id" uuid,
	"default_language" char(2),
	"currency_code" char(3),
	"timezone" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"verified_at" timestamp with time zone,
	"verified_by" uuid,
	"created_via" text NOT NULL,
	"data_consent_version" text,
	"data_consent_at" timestamp with time zone,
	"profile_completeness" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "businesses_voen_format_check" CHECK ("businesses"."voen" ~ '^[0-9]{9}[12]$'),
	CONSTRAINT "businesses_legal_type_check" CHECK ("businesses"."legal_type" in ('legal_entity', 'individual_entrepreneur')),
	CONSTRAINT "businesses_status_check" CHECK ("businesses"."status" in ('active', 'suspended', 'dormant', 'archived')),
	CONSTRAINT "businesses_created_via_check" CHECK ("businesses"."created_via" in ('admin', 'self_signup')),
	CONSTRAINT "businesses_profile_completeness_check" CHECK ("businesses"."profile_completeness" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "buyer_profiles" (
	"business_id" uuid PRIMARY KEY NOT NULL,
	"activity_type_id" uuid NOT NULL,
	"listed_in_directory" boolean DEFAULT true NOT NULL,
	"dormant_stage" text DEFAULT 'none' NOT NULL,
	"dormant_stage_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "buyer_profiles_dormant_stage_check" CHECK ("buyer_profiles"."dormant_stage" in ('none', 'reminded_7', 'reminded_30', 'warned', 'deactivated'))
);
--> statement-breakpoint
CREATE TABLE "person_data" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"contact_name" text NOT NULL,
	"personal_phone" text,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_data_business_id_uq" UNIQUE("business_id")
);
--> statement-breakpoint
CREATE TABLE "seller_profiles" (
	"business_id" uuid PRIMARY KEY NOT NULL,
	"description" jsonb,
	"stock_mode" text DEFAULT 'availability' NOT NULL,
	"min_order_amount" numeric(14, 2),
	"require_delivery_photo" boolean DEFAULT false NOT NULL,
	"low_stock_display_threshold" numeric(14, 3) DEFAULT '5' NOT NULL,
	"default_price_list_id" uuid,
	"default_warehouse_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seller_profiles_stock_mode_check" CHECK ("seller_profiles"."stock_mode" in ('none', 'availability', 'quantity'))
);
--> statement-breakpoint
CREATE TABLE "service_areas" (
	"seller_id" uuid NOT NULL,
	"region_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_areas_seller_id_region_id_pk" PRIMARY KEY("seller_id","region_id")
);
--> statement-breakpoint
CREATE TABLE "warehouses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address_line" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "warehouses_business_id_id_uq" UNIQUE("business_id","id"),
	CONSTRAINT "warehouses_status_check" CHECK ("warehouses"."status" in ('active', 'inactive'))
);
--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_capabilities" ADD CONSTRAINT "business_capabilities_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_privacy" ADD CONSTRAINT "business_privacy_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_default_language_languages_code_fk" FOREIGN KEY ("default_language") REFERENCES "public"."languages"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_currency_code_currencies_code_fk" FOREIGN KEY ("currency_code") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_profiles" ADD CONSTRAINT "buyer_profiles_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_profiles" ADD CONSTRAINT "buyer_profiles_activity_type_id_activity_types_id_fk" FOREIGN KEY ("activity_type_id") REFERENCES "public"."activity_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_data" ADD CONSTRAINT "person_data_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_profiles" ADD CONSTRAINT "seller_profiles_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_profiles" ADD CONSTRAINT "seller_profiles_default_warehouse_fk" FOREIGN KEY ("business_id","default_warehouse_id") REFERENCES "public"."warehouses"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_areas" ADD CONSTRAINT "service_areas_seller_id_businesses_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_areas" ADD CONSTRAINT "service_areas_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "businesses_voen_uq" ON "businesses" USING btree ("voen") WHERE "businesses"."voen" is not null;--> statement-breakpoint
CREATE INDEX "businesses_active_region_idx" ON "businesses" USING btree ("region_id") WHERE "businesses"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "warehouses_single_default_uq" ON "warehouses" USING btree ("business_id") WHERE "warehouses"."is_default";--> statement-breakpoint
-- ===== Elle eklenen bölüm (F1.7) =====
-- T tabloları (data-model §1.1, F1 faz spesifikasyonu §6.3): ENABLE + FORCE; kiracı politikası
-- `<kolon> = nullif(current_setting('app.business_id', true), '')::uuid` (bağlam yoksa 0 satır).
-- Platform politikası: `app.is_platform = 'true'` iken okuma/yazma (c4-component §7; bu tablolar
-- US-016 AC5 yasak listesinde değil). İki politika permissive olduğu için OR ile birleşir.
-- `rls:T,D`: başka kiracının dizin okuması F2 dizin adımında SECURITY DEFINER fonksiyonla gelir.
-- activity_types G sınıfıdır (F1.3 kalıbı).
COMMENT ON TABLE "businesses" IS 'rls:T,D';
--> statement-breakpoint
ALTER TABLE "businesses" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "businesses" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "businesses" FROM PUBLIC;
--> statement-breakpoint
CREATE POLICY "businesses_tenant" ON "businesses" FOR ALL
  USING ("id" = nullif(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK ("id" = nullif(current_setting('app.business_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "businesses_platform" ON "businesses" FOR ALL
  USING (current_setting('app.is_platform', true) = 'true')
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "businesses" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "businesses" TO readonly;
--> statement-breakpoint
COMMENT ON TABLE "seller_profiles" IS 'rls:T';
--> statement-breakpoint
ALTER TABLE "seller_profiles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "seller_profiles" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "seller_profiles" FROM PUBLIC;
--> statement-breakpoint
CREATE POLICY "seller_profiles_tenant" ON "seller_profiles" FOR ALL
  USING ("business_id" = nullif(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK ("business_id" = nullif(current_setting('app.business_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "seller_profiles_platform" ON "seller_profiles" FOR ALL
  USING (current_setting('app.is_platform', true) = 'true')
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "seller_profiles" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "seller_profiles" TO readonly;
--> statement-breakpoint
COMMENT ON TABLE "buyer_profiles" IS 'rls:T,D';
--> statement-breakpoint
ALTER TABLE "buyer_profiles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "buyer_profiles" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "buyer_profiles" FROM PUBLIC;
--> statement-breakpoint
CREATE POLICY "buyer_profiles_tenant" ON "buyer_profiles" FOR ALL
  USING ("business_id" = nullif(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK ("business_id" = nullif(current_setting('app.business_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "buyer_profiles_platform" ON "buyer_profiles" FOR ALL
  USING (current_setting('app.is_platform', true) = 'true')
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "buyer_profiles" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "buyer_profiles" TO readonly;
--> statement-breakpoint
COMMENT ON TABLE "business_privacy" IS 'rls:T,D';
--> statement-breakpoint
ALTER TABLE "business_privacy" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "business_privacy" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "business_privacy" FROM PUBLIC;
--> statement-breakpoint
CREATE POLICY "business_privacy_tenant" ON "business_privacy" FOR ALL
  USING ("business_id" = nullif(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK ("business_id" = nullif(current_setting('app.business_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "business_privacy_platform" ON "business_privacy" FOR ALL
  USING (current_setting('app.is_platform', true) = 'true')
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "business_privacy" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "business_privacy" TO readonly;
--> statement-breakpoint
COMMENT ON TABLE "person_data" IS 'rls:T';
--> statement-breakpoint
ALTER TABLE "person_data" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "person_data" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "person_data" FROM PUBLIC;
--> statement-breakpoint
CREATE POLICY "person_data_tenant" ON "person_data" FOR ALL
  USING ("business_id" = nullif(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK ("business_id" = nullif(current_setting('app.business_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "person_data_platform" ON "person_data" FOR ALL
  USING (current_setting('app.is_platform', true) = 'true')
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "person_data" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "person_data" TO readonly;
--> statement-breakpoint
COMMENT ON TABLE "branches" IS 'rls:T';
--> statement-breakpoint
ALTER TABLE "branches" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "branches" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "branches" FROM PUBLIC;
--> statement-breakpoint
CREATE POLICY "branches_tenant" ON "branches" FOR ALL
  USING ("business_id" = nullif(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK ("business_id" = nullif(current_setting('app.business_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "branches_platform" ON "branches" FOR ALL
  USING (current_setting('app.is_platform', true) = 'true')
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "branches" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "branches" TO readonly;
--> statement-breakpoint
COMMENT ON TABLE "warehouses" IS 'rls:T';
--> statement-breakpoint
ALTER TABLE "warehouses" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "warehouses" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "warehouses" FROM PUBLIC;
--> statement-breakpoint
CREATE POLICY "warehouses_tenant" ON "warehouses" FOR ALL
  USING ("business_id" = nullif(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK ("business_id" = nullif(current_setting('app.business_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "warehouses_platform" ON "warehouses" FOR ALL
  USING (current_setting('app.is_platform', true) = 'true')
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "warehouses" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "warehouses" TO readonly;
--> statement-breakpoint
COMMENT ON TABLE "service_areas" IS 'rls:T';
--> statement-breakpoint
ALTER TABLE "service_areas" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "service_areas" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "service_areas" FROM PUBLIC;
--> statement-breakpoint
CREATE POLICY "service_areas_tenant" ON "service_areas" FOR ALL
  USING ("seller_id" = nullif(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK ("seller_id" = nullif(current_setting('app.business_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "service_areas_platform" ON "service_areas" FOR ALL
  USING (current_setting('app.is_platform', true) = 'true')
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "service_areas" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "service_areas" TO readonly;
--> statement-breakpoint
-- business_capabilities (K1, state-machines §10): kiracı kendi satırlarını okur ve yalnızca
-- INSERT yapabilir: `buyer` + `approved` (perakendeci kaydı) veya `seller` + `pending`; onaylayan
-- alanları boş olmalı. Kiracıya UPDATE/DELETE politikası yok; approved/suspended geçişleri (buyer
-- dahil) yalnızca platform bağlamında. WITH CHECK ihlali 42501 verir.
COMMENT ON TABLE "business_capabilities" IS 'rls:T';
--> statement-breakpoint
ALTER TABLE "business_capabilities" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "business_capabilities" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "business_capabilities" FROM PUBLIC;
--> statement-breakpoint
CREATE POLICY "business_capabilities_tenant_read" ON "business_capabilities" FOR SELECT
  USING ("business_id" = nullif(current_setting('app.business_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "business_capabilities_tenant_insert" ON "business_capabilities" FOR INSERT
  WITH CHECK (
    "business_id" = nullif(current_setting('app.business_id', true), '')::uuid
    AND "approved_by" IS NULL
    AND "approved_at" IS NULL
    AND (
      ("capability" = 'buyer' AND "status" = 'approved')
      OR ("capability" = 'seller' AND "status" = 'pending')
    )
  );
--> statement-breakpoint
CREATE POLICY "business_capabilities_platform" ON "business_capabilities" FOR ALL
  USING (current_setting('app.is_platform', true) = 'true')
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "business_capabilities" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "business_capabilities" TO readonly;
--> statement-breakpoint
COMMENT ON TABLE "activity_types" IS 'rls:G';
--> statement-breakpoint
ALTER TABLE "activity_types" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "activity_types" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "activity_types" FROM PUBLIC;
--> statement-breakpoint
CREATE POLICY "activity_types_read" ON "activity_types" FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY "activity_types_platform_insert" ON "activity_types" FOR INSERT
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
CREATE POLICY "activity_types_platform_update" ON "activity_types" FOR UPDATE
  USING (current_setting('app.is_platform', true) = 'true')
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
CREATE POLICY "activity_types_platform_delete" ON "activity_types" FOR DELETE
  USING (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "activity_types" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "activity_types" TO readonly;
--> statement-breakpoint
-- businesses alan koruması (state-machines §9): status, verified_at, verified_by, created_via
-- yalnızca platform bağlamında değişir. Kiracı bağlamında INSERT yalnızca status = active,
-- created_via = self_signup ve doğrulama alanları boşken; UPDATE bu alanları değiştiremez.
-- İhlal 42501. Fonksiyon SECURITY DEFINER değildir (tablo okumaz); search_path sabittir.
CREATE FUNCTION "businesses_guard_platform_columns"() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF current_setting('app.is_platform', true) = 'true' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'active'
       OR NEW.created_via <> 'self_signup'
       OR NEW.verified_at IS NOT NULL
       OR NEW.verified_by IS NOT NULL THEN
      RAISE EXCEPTION 'businesses: bu alanlar yalnızca platform bağlamında ayarlanabilir'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
     OR NEW.verified_by IS DISTINCT FROM OLD.verified_by
     OR NEW.created_via IS DISTINCT FROM OLD.created_via THEN
    RAISE EXCEPTION 'businesses: bu alanlar yalnızca platform bağlamında değiştirilebilir'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "businesses_guard_platform_columns"() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER "businesses_guard_platform_columns"
  BEFORE INSERT OR UPDATE ON "businesses"
  FOR EACH ROW EXECUTE FUNCTION "businesses_guard_platform_columns"();
