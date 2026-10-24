-- Elle eklenen bölüm aşağıda; drizzle-kit bu dosyayı yeniden üretmez.
CREATE TABLE "countries" (
	"code" char(2) PRIMARY KEY NOT NULL,
	"name" jsonb NOT NULL,
	"default_currency" char(3) NOT NULL,
	"default_timezone" text NOT NULL,
	"phone_prefix" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "currencies" (
	"code" char(3) PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"decimals" smallint NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "currencies_decimals_check" CHECK ("currencies"."decimals" between 0 and 4)
);
--> statement-breakpoint
CREATE TABLE "languages" (
	"code" char(2) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"direction" text DEFAULT 'ltr' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "languages_direction_check" CHECK ("languages"."direction" in ('ltr', 'rtl'))
);
--> statement-breakpoint
CREATE TABLE "regions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_code" char(2) NOT NULL,
	"parent_id" uuid,
	"type" text NOT NULL,
	"name" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "regions_type_check" CHECK ("regions"."type" in ('city', 'district'))
);
--> statement-breakpoint
CREATE TABLE "ui_translations" (
	"key" text NOT NULL,
	"lang" char(2) NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ui_translations_key_lang_pk" PRIMARY KEY("key","lang")
);
--> statement-breakpoint
ALTER TABLE "countries" ADD CONSTRAINT "countries_default_currency_currencies_code_fk" FOREIGN KEY ("default_currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regions" ADD CONSTRAINT "regions_country_code_countries_code_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regions" ADD CONSTRAINT "regions_parent_id_regions_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ui_translations" ADD CONSTRAINT "ui_translations_lang_languages_code_fk" FOREIGN KEY ("lang") REFERENCES "public"."languages"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "languages_single_default_uq" ON "languages" USING btree ("is_default") WHERE "languages"."is_default";
--> statement-breakpoint
-- ===== Elle eklenen bölüm (F1.3) =====
-- Beş tablo da G sınıfıdır (data-model §1.1, F1 faz spesifikasyonu §6.5): herkes okur
-- (SELECT USING (true)); INSERT, UPDATE (USING ve WITH CHECK) ve DELETE yalnızca platform
-- bağlamında (app.is_platform = 'true'). FORCE: tablo sahibi (migrator) de politikalara tabidir;
-- seed bu yüzden platform bağlamında çalışır. app_user'a dört yetki verilir, yazmayı RLS sınırlar.
--> statement-breakpoint
COMMENT ON TABLE "languages" IS 'rls:G';
--> statement-breakpoint
ALTER TABLE "languages" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "languages" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "languages" FROM PUBLIC;
--> statement-breakpoint
CREATE POLICY "languages_read" ON "languages" FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY "languages_platform_insert" ON "languages" FOR INSERT
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
CREATE POLICY "languages_platform_update" ON "languages" FOR UPDATE
  USING (current_setting('app.is_platform', true) = 'true')
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
CREATE POLICY "languages_platform_delete" ON "languages" FOR DELETE
  USING (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "languages" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "languages" TO readonly;
--> statement-breakpoint
COMMENT ON TABLE "ui_translations" IS 'rls:G';
--> statement-breakpoint
ALTER TABLE "ui_translations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ui_translations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "ui_translations" FROM PUBLIC;
--> statement-breakpoint
CREATE POLICY "ui_translations_read" ON "ui_translations" FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY "ui_translations_platform_insert" ON "ui_translations" FOR INSERT
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
CREATE POLICY "ui_translations_platform_update" ON "ui_translations" FOR UPDATE
  USING (current_setting('app.is_platform', true) = 'true')
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
CREATE POLICY "ui_translations_platform_delete" ON "ui_translations" FOR DELETE
  USING (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "ui_translations" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "ui_translations" TO readonly;
--> statement-breakpoint
COMMENT ON TABLE "currencies" IS 'rls:G';
--> statement-breakpoint
ALTER TABLE "currencies" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "currencies" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "currencies" FROM PUBLIC;
--> statement-breakpoint
CREATE POLICY "currencies_read" ON "currencies" FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY "currencies_platform_insert" ON "currencies" FOR INSERT
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
CREATE POLICY "currencies_platform_update" ON "currencies" FOR UPDATE
  USING (current_setting('app.is_platform', true) = 'true')
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
CREATE POLICY "currencies_platform_delete" ON "currencies" FOR DELETE
  USING (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "currencies" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "currencies" TO readonly;
--> statement-breakpoint
COMMENT ON TABLE "countries" IS 'rls:G';
--> statement-breakpoint
ALTER TABLE "countries" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "countries" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "countries" FROM PUBLIC;
--> statement-breakpoint
CREATE POLICY "countries_read" ON "countries" FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY "countries_platform_insert" ON "countries" FOR INSERT
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
CREATE POLICY "countries_platform_update" ON "countries" FOR UPDATE
  USING (current_setting('app.is_platform', true) = 'true')
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
CREATE POLICY "countries_platform_delete" ON "countries" FOR DELETE
  USING (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "countries" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "countries" TO readonly;
--> statement-breakpoint
COMMENT ON TABLE "regions" IS 'rls:G';
--> statement-breakpoint
ALTER TABLE "regions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "regions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "regions" FROM PUBLIC;
--> statement-breakpoint
CREATE POLICY "regions_read" ON "regions" FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY "regions_platform_insert" ON "regions" FOR INSERT
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
CREATE POLICY "regions_platform_update" ON "regions" FOR UPDATE
  USING (current_setting('app.is_platform', true) = 'true')
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
CREATE POLICY "regions_platform_delete" ON "regions" FOR DELETE
  USING (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "regions" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "regions" TO readonly;
