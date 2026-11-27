-- F3.7a müşteriye özel fiyat (US-035 AC1–AC2, ADR-0019; data-model §4.9 `customer_prices`, §4.8
-- `import_jobs.buyer_id`; kart docs/tasks/F3.7a.md K1–K12; kullanıcı kararları S1–S3 = A).
-- Elle eklenen bölüm aşağıda (modüller arası FK'lar, dizinler, RLS, GRANT, arşiv tetikleyicisi).
CREATE TABLE "customer_prices" (
	"seller_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"packaging_id" uuid NOT NULL,
	"unit_price" numeric(14, 4) NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "customer_prices_pk" PRIMARY KEY("seller_id","buyer_id","packaging_id","valid_from"),
	CONSTRAINT "customer_prices_unit_price_check" CHECK ("customer_prices"."unit_price" >= 0),
	CONSTRAINT "customer_prices_parties_check" CHECK ("customer_prices"."seller_id" <> "customer_prices"."buyer_id")
);
--> statement-breakpoint
ALTER TABLE "import_jobs" DROP CONSTRAINT "import_jobs_failure_code_check";--> statement-breakpoint
ALTER TABLE "import_jobs" ADD COLUMN "buyer_id" uuid;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_buyer_check" CHECK (("import_jobs"."type" = 'customer_prices') = ("import_jobs"."buyer_id" is not null));--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_failure_code_check" CHECK (("import_jobs"."status" = 'failed') = ("import_jobs"."failure_code" is not null) and ("import_jobs"."failure_code" is null or "import_jobs"."failure_code" in ('FILE_INVALID', 'IMPORT_TOO_MANY_ROWS', 'APPLY_FAILED', 'TIMED_OUT', 'CONNECTION_INACTIVE')));--> statement-breakpoint
-- ===== Elle eklenen bölüm (F3.7a) =====
-- T tablosu (`seller_id`) ama `buyer_id` taşır (R30): kiracı yalnız kendi satırları, platform yalnız
-- okur (R39, `check-rls` PLATFORM_WRITE_FORBIDDEN_TABLES), perakendeciye hiçbir politika yok (alıcı
-- fiyatı yalnız `PriceResolver` üzerinden). Bileşik ambalaj FK'sı başka satıcının ambalajına fiyat
-- yazmayı RLS'ten bağımsız engeller.
ALTER TABLE "customer_prices" ADD CONSTRAINT "customer_prices_seller_id_businesses_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "customer_prices" ADD CONSTRAINT "customer_prices_buyer_id_businesses_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Ambalaj seviyesi silinince müşteri fiyatları da silinir (liste satırlarıyla aynı, 0036).
ALTER TABLE "customer_prices" ADD CONSTRAINT "customer_prices_packaging_fk" FOREIGN KEY ("packaging_id","seller_id") REFERENCES "public"."product_packaging"("id","seller_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "customer_prices_packaging_idx" ON "customer_prices" USING btree ("packaging_id");
--> statement-breakpoint
CREATE INDEX "customer_prices_buyer_idx" ON "customer_prices" USING btree ("buyer_id");
--> statement-breakpoint
COMMENT ON TABLE "customer_prices" IS 'rls:T';
--> statement-breakpoint
ALTER TABLE "customer_prices" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "customer_prices" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "customer_prices" FROM PUBLIC;
--> statement-breakpoint
CREATE POLICY "customer_prices_tenant" ON "customer_prices" FOR ALL
  USING ("seller_id" = nullif(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK ("seller_id" = nullif(current_setting('app.business_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "customer_prices_platform_select" ON "customer_prices" FOR SELECT
  USING (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
-- Geçerli olmuş satırın fiyatı değişmez (servis `valid_from > now` koşuluyla günceller); kaldırma
-- (S1 = A) bir ambalajın bütün satırlarını siler.
GRANT SELECT, INSERT, DELETE ON TABLE "customer_prices" TO app_user;
--> statement-breakpoint
GRANT UPDATE ("unit_price") ON TABLE "customer_prices" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "customer_prices" TO readonly;
--> statement-breakpoint
-- R40: arşivlenen perakendecinin müşteri fiyatları silinir. Admin arşivi (F2.18), 180. gün arşivi
-- (`dormant_archive`) ve `business_purge_rows` üçü de önce `businesses.status = 'archived'` yazar;
-- tek tetikleyici hepsini kapsar ve işletme satırı silinmeden önce FK'yı çözer. Tetikleyici
-- fonksiyonu migrator sahipli DEFINER; FORCE RLS altında yalnız migrator'a açık iki politika.
CREATE POLICY "customer_prices_definer_select" ON "customer_prices" FOR SELECT TO migrator
  USING (true);
--> statement-breakpoint
CREATE POLICY "customer_prices_definer_archive" ON "customer_prices" FOR DELETE TO migrator
  USING (true);
--> statement-breakpoint
CREATE FUNCTION "businesses_archived_clear_customer_prices"() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  DELETE FROM public.customer_prices WHERE buyer_id = NEW.id;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "businesses_archived_clear_customer_prices"() FROM PUBLIC;
--> statement-breakpoint
-- D6 kuralı (bütün DEFINER fonksiyonları app_user çalıştırır). Tetikleyici fonksiyonu doğrudan
-- çağrılamaz; izin yalnız `businesses` güncellemesinde tetikleyiciyi kuralla aynı tutar.
GRANT EXECUTE ON FUNCTION "businesses_archived_clear_customer_prices"() TO app_user;
--> statement-breakpoint
CREATE TRIGGER "businesses_archived_clear_customer_prices"
  AFTER UPDATE OF "status" ON "businesses"
  FOR EACH ROW
  WHEN (NEW.status = 'archived' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION "businesses_archived_clear_customer_prices"();
--> statement-breakpoint
-- `import_jobs.buyer_id` (S2 = A: bir dosya bir müşteri). İş açılınca değişmez (UPDATE izni yok).
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_buyer_id_businesses_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;
