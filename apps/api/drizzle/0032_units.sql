-- F3.1 birim kataloğu (US-028; data-model §4.8 `units`, `unit_conversions`). Elle eklenen bölüm aşağıda.
-- G sınıfı (F1.3 kalıbı): herkes okur, yazma yalnız platform bağlamında (`app.is_platform`).
-- `units` silinmez (US-028 AC3, R38): app_user'a DELETE izni ve silme politikası yok.
CREATE TABLE "unit_conversions" (
	"from_code" text NOT NULL,
	"to_code" text NOT NULL,
	"factor" numeric(18, 6) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unit_conversions_from_code_to_code_pk" PRIMARY KEY("from_code","to_code"),
	CONSTRAINT "unit_conversions_distinct_check" CHECK ("unit_conversions"."from_code" <> "unit_conversions"."to_code"),
	CONSTRAINT "unit_conversions_factor_check" CHECK ("unit_conversions"."factor" > 0)
);
--> statement-breakpoint
CREATE TABLE "units" (
	"code" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"name" jsonb NOT NULL,
	"abbreviation" jsonb NOT NULL,
	"allows_decimal" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "units_code_check" CHECK ("units"."code" ~ '^[A-Z0-9]{2,3}$'),
	CONSTRAINT "units_kind_check" CHECK ("units"."kind" in ('count', 'weight', 'volume', 'length', 'area', 'package'))
);
--> statement-breakpoint
ALTER TABLE "unit_conversions" ADD CONSTRAINT "unit_conversions_from_code_units_code_fk" FOREIGN KEY ("from_code") REFERENCES "public"."units"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_conversions" ADD CONSTRAINT "unit_conversions_to_code_units_code_fk" FOREIGN KEY ("to_code") REFERENCES "public"."units"("code") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- ===== Elle eklenen bölüm (F3.1) =====
COMMENT ON TABLE "units" IS 'rls:G';
--> statement-breakpoint
COMMENT ON TABLE "unit_conversions" IS 'rls:G';
--> statement-breakpoint
ALTER TABLE "units" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "units" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "units" FROM PUBLIC;
--> statement-breakpoint
CREATE POLICY "units_read" ON "units" FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY "units_platform_insert" ON "units" FOR INSERT
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
CREATE POLICY "units_platform_update" ON "units" FOR UPDATE
  USING (current_setting('app.is_platform', true) = 'true')
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "units" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "units" TO readonly;
--> statement-breakpoint
ALTER TABLE "unit_conversions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "unit_conversions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "unit_conversions" FROM PUBLIC;
--> statement-breakpoint
CREATE POLICY "unit_conversions_read" ON "unit_conversions" FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY "unit_conversions_platform_insert" ON "unit_conversions" FOR INSERT
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
CREATE POLICY "unit_conversions_platform_update" ON "unit_conversions" FOR UPDATE
  USING (current_setting('app.is_platform', true) = 'true')
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
CREATE POLICY "unit_conversions_platform_delete" ON "unit_conversions" FOR DELETE
  USING (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "unit_conversions" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "unit_conversions" TO readonly;
