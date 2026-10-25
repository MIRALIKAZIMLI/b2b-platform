CREATE TABLE "entitlement_overrides" (
	"business_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entitlement_overrides_business_id_key_pk" PRIMARY KEY("business_id","key")
);
--> statement-breakpoint
CREATE TABLE "plan_entitlements" (
	"plan_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_entitlements_plan_id_key_pk" PRIMARY KEY("plan_id","key")
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" jsonb NOT NULL,
	"capability" text NOT NULL,
	"price" numeric(14, 2) NOT NULL,
	"currency_code" char(3) NOT NULL,
	"period" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_code_uq" UNIQUE("code"),
	CONSTRAINT "plans_capability_check" CHECK ("plans"."capability" in ('seller', 'buyer')),
	CONSTRAINT "plans_period_check" CHECK ("plans"."period" in ('month', 'year')),
	CONSTRAINT "plans_price_check" CHECK ("plans"."price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" text NOT NULL,
	"current_period_start" date NOT NULL,
	"current_period_end" date NOT NULL,
	"grace_until" date,
	"payment_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_status_check" CHECK ("subscriptions"."status" in ('active', 'grace', 'read_only', 'cancelled')),
	CONSTRAINT "subscriptions_period_check" CHECK ("subscriptions"."current_period_end" >= "subscriptions"."current_period_start")
);
--> statement-breakpoint
ALTER TABLE "entitlement_overrides" ADD CONSTRAINT "entitlement_overrides_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_entitlements" ADD CONSTRAINT "plan_entitlements_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_currency_code_currencies_code_fk" FOREIGN KEY ("currency_code") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_current_uq" ON "subscriptions" USING btree ("business_id") WHERE "subscriptions"."status" in ('active', 'grace', 'read_only');
--> statement-breakpoint
-- ===== Elle eklenen bölüm (F1.4b) =====
-- Elle eklenen bölüm aşağıda; drizzle-kit bu dosyayı yeniden üretmez.
-- plans, plan_entitlements: G sınıfı (F1.3 kalıbı): herkes okur, yalnızca platform yazar.
-- subscriptions, entitlement_overrides: T sınıfı; kiracı yalnızca kendi satırını OKUR (Mimar D1),
-- yazma yalnızca platform politikasıyla. subscriptions satırı silinmez (geçmiş; DELETE izni yok).
COMMENT ON TABLE "plans" IS 'rls:G';
--> statement-breakpoint
ALTER TABLE "plans" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "plans" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "plans" FROM PUBLIC;
--> statement-breakpoint
CREATE POLICY "plans_read" ON "plans" FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY "plans_platform_insert" ON "plans" FOR INSERT
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
CREATE POLICY "plans_platform_update" ON "plans" FOR UPDATE
  USING (current_setting('app.is_platform', true) = 'true')
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
CREATE POLICY "plans_platform_delete" ON "plans" FOR DELETE
  USING (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "plans" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "plans" TO readonly;
--> statement-breakpoint
COMMENT ON TABLE "plan_entitlements" IS 'rls:G';
--> statement-breakpoint
ALTER TABLE "plan_entitlements" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "plan_entitlements" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "plan_entitlements" FROM PUBLIC;
--> statement-breakpoint
CREATE POLICY "plan_entitlements_read" ON "plan_entitlements" FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY "plan_entitlements_platform_insert" ON "plan_entitlements" FOR INSERT
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
CREATE POLICY "plan_entitlements_platform_update" ON "plan_entitlements" FOR UPDATE
  USING (current_setting('app.is_platform', true) = 'true')
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
CREATE POLICY "plan_entitlements_platform_delete" ON "plan_entitlements" FOR DELETE
  USING (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "plan_entitlements" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "plan_entitlements" TO readonly;
--> statement-breakpoint
COMMENT ON TABLE "subscriptions" IS 'rls:T';
--> statement-breakpoint
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "subscriptions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "subscriptions" FROM PUBLIC;
--> statement-breakpoint
CREATE POLICY "subscriptions_tenant_read" ON "subscriptions" FOR SELECT
  USING ("business_id" = nullif(current_setting('app.business_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "subscriptions_platform" ON "subscriptions" FOR ALL
  USING (current_setting('app.is_platform', true) = 'true')
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "subscriptions" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "subscriptions" TO readonly;
--> statement-breakpoint
COMMENT ON TABLE "entitlement_overrides" IS 'rls:T';
--> statement-breakpoint
ALTER TABLE "entitlement_overrides" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "entitlement_overrides" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "entitlement_overrides" FROM PUBLIC;
--> statement-breakpoint
CREATE POLICY "entitlement_overrides_tenant_read" ON "entitlement_overrides" FOR SELECT
  USING ("business_id" = nullif(current_setting('app.business_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "entitlement_overrides_platform" ON "entitlement_overrides" FOR ALL
  USING (current_setting('app.is_platform', true) = 'true')
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "entitlement_overrides" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "entitlement_overrides" TO readonly;
--> statement-breakpoint
-- settings_get plan katmanı (F1.4b, Mimar D2): işletme verilirse güncel aboneliğin
-- (active / grace / read_only) planına ait scope = 'plan' satırı da döner. İşletme ve plan
-- satırları yalnızca p_business_id işlemin kiracısıyla aynıysa veya platform bağlamında döner.
-- Fonksiyon migrator sahiplidir; subscriptions FORCE RLS olduğu için okuma da aynı bağlam
-- koşuluna tabidir (kiracı okuma veya platform politikası).
CREATE OR REPLACE FUNCTION settings_get(p_key text, p_business_id uuid)
RETURNS TABLE (scope text, value jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT s.scope, s.value
    FROM public.settings s
   WHERE s.key = p_key
     AND (
       s.scope = 'platform'
       OR (
         p_business_id IS NOT NULL
         AND (
           p_business_id = nullif(current_setting('app.business_id', true), '')::uuid
           OR current_setting('app.is_platform', true) = 'true'
         )
         AND (
           (s.scope = 'business' AND s.scope_id = p_business_id)
           OR (
             s.scope = 'plan'
             AND s.scope_id = (
               SELECT sub.plan_id
                 FROM public.subscriptions sub
                WHERE sub.business_id = p_business_id
                  AND sub.status IN ('active', 'grace', 'read_only')
             )
           )
         )
       )
     );
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION settings_get(text, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION settings_get(text, uuid) TO app_user;
