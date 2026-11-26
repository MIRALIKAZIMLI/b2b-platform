-- F3.5a Excel içe aktarma (US-031, SF-08; data-model §4.8 `import_jobs`; kart docs/tasks/F3.5a.md)
-- ve SKU kararı (kullanıcı 2026-11-26, A): ürün ve varyant SKU'su satıcı içinde büyük/küçük harf
-- duyarsız tekil. Var olan veride yalnız harfi farklı iki SKU varsa migration açık mesajla durur.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.products GROUP BY seller_id, lower(sku) HAVING count(*) > 1) THEN
    RAISE EXCEPTION '0037: products içinde yalnız büyük/küçük harfi farklı SKU var; önce düzeltilmeli'
      USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM public.product_variants GROUP BY seller_id, lower(sku) HAVING count(*) > 1) THEN
    RAISE EXCEPTION '0037: product_variants içinde yalnız büyük/küçük harfi farklı SKU var; önce düzeltilmeli'
      USING ERRCODE = '23505';
  END IF;
END;
$$;
--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"seller_id" uuid NOT NULL,
	"type" text NOT NULL,
	"file_id" uuid NOT NULL,
	"status" text DEFAULT 'uploaded' NOT NULL,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_report_file_id" uuid,
	"failure_code" text,
	"applied_until_row" integer,
	"can_write_prices" boolean NOT NULL,
	"locale" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_jobs_file_uq" UNIQUE("file_id"),
	CONSTRAINT "import_jobs_type_check" CHECK ("import_jobs"."type" in ('products', 'customer_prices', 'stock')),
	CONSTRAINT "import_jobs_status_check" CHECK ("import_jobs"."status" in ('uploaded', 'validating', 'preview_ready', 'applying', 'done', 'failed')),
	CONSTRAINT "import_jobs_failure_code_check" CHECK (("import_jobs"."status" = 'failed') = ("import_jobs"."failure_code" is not null) and ("import_jobs"."failure_code" is null or "import_jobs"."failure_code" in ('FILE_INVALID', 'IMPORT_TOO_MANY_ROWS', 'APPLY_FAILED'))),
	CONSTRAINT "import_jobs_stats_check" CHECK (jsonb_typeof("import_jobs"."stats") = 'object')
);
--> statement-breakpoint
ALTER TABLE "product_variants" DROP CONSTRAINT "product_variants_seller_sku_uq";--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_seller_sku_uq";--> statement-breakpoint
CREATE INDEX "import_jobs_seller_idx" ON "import_jobs" USING btree ("seller_id","created_at");--> statement-breakpoint
CREATE INDEX "import_jobs_status_idx" ON "import_jobs" USING btree ("status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_seller_sku_lower_uq" ON "product_variants" USING btree ("seller_id",lower("sku"));--> statement-breakpoint
CREATE UNIQUE INDEX "products_seller_sku_lower_uq" ON "products" USING btree ("seller_id",lower("sku"));--> statement-breakpoint
-- ===== Elle eklenen bölüm (F3.5a) =====
-- T tablosu (`seller_id`). Kiracı yalnız kendi işleri; platform yalnız okur (`check-rls`
-- PLATFORM_WRITE_FORBIDDEN_TABLES). Perakendeci hiçbir politikayla erişemez (uçlar `imports.run`,
-- yetenek seller). Bileşik FK'lar başka işletmenin dosyasını bağlamayı RLS'ten bağımsız engeller.
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_seller_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_file_fk" FOREIGN KEY ("seller_id","file_id") REFERENCES "public"."files"("owner_business_id","id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_report_file_fk" FOREIGN KEY ("seller_id","error_report_file_id") REFERENCES "public"."files"("owner_business_id","id") ON DELETE no action ON UPDATE no action;
COMMENT ON TABLE "import_jobs" IS 'rls:T';
ALTER TABLE "import_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "import_jobs" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "import_jobs" FROM PUBLIC;
CREATE POLICY "import_jobs_tenant" ON "import_jobs" FOR ALL
  USING ("seller_id" = nullif(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK ("seller_id" = nullif(current_setting('app.business_id', true), '')::uuid);
CREATE POLICY "import_jobs_platform_select" ON "import_jobs" FOR SELECT
  USING (current_setting('app.is_platform', true) = 'true');
-- Silme yok: süre dolumu yalnız aşağıdaki DEFINER fonksiyonuyla (iş + dosya satırları birlikte).
GRANT SELECT, INSERT ON TABLE "import_jobs" TO app_user;
GRANT UPDATE ("status", "stats", "error_report_file_id", "failure_code", "applied_until_row", "can_write_prices", "updated_at") ON TABLE "import_jobs" TO app_user;
GRANT SELECT ON TABLE "import_jobs" TO readonly;
--> statement-breakpoint
-- SF-08: `p_cutoff`'tan önce güncellenmiş `preview_ready` işleri (en çok `p_limit`) siler; iş
-- satırı, yüklenen dosya ve hata raporu satırı aynı işlemde gider. Depo nesnelerinin anahtarları
-- döner; worker işlem bittikten sonra nesneleri siler. Yalnız bağlamsız sistem işi çağırır.
-- Kişisel veri dönmez (anahtar `<işletme>/import/<dosya>.xlsx`).
CREATE FUNCTION "import_jobs_expire"(p_cutoff timestamptz, p_limit integer)
  RETURNS TABLE (job_id uuid, seller_id uuid, object_key text)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  IF nullif(current_setting('app.business_id', true), '') IS NOT NULL
     OR nullif(current_setting('app.user_id', true), '') IS NOT NULL
     OR coalesce(nullif(current_setting('app.is_platform', true), ''), 'false') = 'true' THEN
    RAISE EXCEPTION 'import_jobs_expire: yalnız bağlamsız sistem işi' USING ERRCODE = '42501';
  END IF;
  IF p_cutoff IS NULL OR p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'import_jobs_expire: geçersiz parametre' USING ERRCODE = '22023';
  END IF;

  -- Tek deyim: iş satırları ve dosya satırları birlikte silinir; FK denetimi deyim sonunda.
  RETURN QUERY
  WITH due AS (
    SELECT j.id
      FROM public.import_jobs j
     WHERE j.status = 'preview_ready'
       AND j.updated_at < p_cutoff
     ORDER BY j.updated_at, j.id
     LIMIT p_limit
       FOR UPDATE SKIP LOCKED
  ), removed AS (
    DELETE FROM public.import_jobs j
     USING due
     WHERE j.id = due.id
       AND j.status = 'preview_ready'
    RETURNING j.id AS job_id, j.seller_id, j.file_id, j.error_report_file_id
  ), owned AS (
    SELECT r.job_id, r.seller_id, r.file_id AS fid FROM removed r
    UNION ALL
    SELECT r.job_id, r.seller_id, r.error_report_file_id FROM removed r
     WHERE r.error_report_file_id IS NOT NULL
  ), gone AS (
    DELETE FROM public.files f
     USING owned o
     WHERE f.id = o.fid
       AND f.owner_business_id = o.seller_id
       AND f.purpose = 'import'
    RETURNING o.job_id, o.seller_id, f.object_key
  )
  SELECT r.job_id, r.seller_id, g.object_key
    FROM removed r
    LEFT JOIN gone g ON g.job_id = r.job_id
   ORDER BY r.job_id, g.object_key;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "import_jobs_expire"(timestamptz, integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "import_jobs_expire"(timestamptz, integer) TO app_user;
