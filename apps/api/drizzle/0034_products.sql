-- F3.3a ürün, varyant, ambalaj, görünürlük (US-030; data-model §4.8).
-- Elle eklenen bölüm aşağıda (FK'lar, RLS, GRANT, marka reddi tetikleyicisi, satıcı özeti kategorileri).
CREATE TABLE "product_packaging" (
	"id" uuid PRIMARY KEY NOT NULL,
	"variant_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"level" text NOT NULL,
	"unit_code" text NOT NULL,
	"base_qty" numeric(14, 3) NOT NULL,
	"gtin" text,
	"weight_g" integer,
	"dimensions_mm" jsonb,
	"is_sales_unit" boolean DEFAULT false NOT NULL,
	"min_order_qty" numeric(14, 3) DEFAULT '1' NOT NULL,
	"order_multiple" numeric(14, 3) DEFAULT '1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_packaging_variant_level_uq" UNIQUE("variant_id","level"),
	CONSTRAINT "product_packaging_level_check" CHECK ("product_packaging"."level" in ('unit', 'inner', 'case', 'pallet')),
	CONSTRAINT "product_packaging_base_qty_check" CHECK ("product_packaging"."base_qty" > 0),
	CONSTRAINT "product_packaging_order_qty_check" CHECK ("product_packaging"."min_order_qty" > 0 and "product_packaging"."order_multiple" > 0),
	CONSTRAINT "product_packaging_weight_check" CHECK ("product_packaging"."weight_g" is null or "product_packaging"."weight_g" > 0)
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"gtin" text,
	"is_available" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_variants_seller_sku_uq" UNIQUE("seller_id","sku"),
	CONSTRAINT "product_variants_id_seller_uq" UNIQUE("id","seller_id"),
	CONSTRAINT "product_variants_status_check" CHECK ("product_variants"."status" in ('active', 'archived')),
	CONSTRAINT "product_variants_attributes_check" CHECK (jsonb_typeof("product_variants"."attributes") = 'object')
);
--> statement-breakpoint
CREATE TABLE "product_visibility" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"region_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_visibility_product_region_uq" UNIQUE("product_id","region_id")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"seller_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"name" jsonb NOT NULL,
	"description" jsonb,
	"category_id" uuid NOT NULL,
	"brand_id" uuid,
	"base_unit_code" text NOT NULL,
	"has_expiry" boolean DEFAULT false NOT NULL,
	"shelf_life_months" smallint,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_seller_sku_uq" UNIQUE("seller_id","sku"),
	CONSTRAINT "products_id_seller_uq" UNIQUE("id","seller_id"),
	CONSTRAINT "products_status_check" CHECK ("products"."status" in ('draft', 'active', 'archived')),
	CONSTRAINT "products_shelf_life_check" CHECK (("products"."has_expiry" and "products"."shelf_life_months" is not null and "products"."shelf_life_months" between 1 and 120) or (not "products"."has_expiry" and "products"."shelf_life_months" is null)),
	CONSTRAINT "products_name_check" CHECK (jsonb_typeof("products"."name") = 'object')
);
--> statement-breakpoint
ALTER TABLE "product_packaging" ADD CONSTRAINT "product_packaging_unit_code_units_code_fk" FOREIGN KEY ("unit_code") REFERENCES "public"."units"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_packaging" ADD CONSTRAINT "product_packaging_variant_fk" FOREIGN KEY ("variant_id","seller_id") REFERENCES "public"."product_variants"("id","seller_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_fk" FOREIGN KEY ("product_id","seller_id") REFERENCES "public"."products"("id","seller_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_visibility" ADD CONSTRAINT "product_visibility_product_fk" FOREIGN KEY ("product_id","seller_id") REFERENCES "public"."products"("id","seller_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_base_unit_code_units_code_fk" FOREIGN KEY ("base_unit_code") REFERENCES "public"."units"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_packaging_seller_gtin_idx" ON "product_packaging" USING btree ("seller_id","gtin");--> statement-breakpoint
CREATE INDEX "product_variants_product_idx" ON "product_variants" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_variants_seller_gtin_idx" ON "product_variants" USING btree ("seller_id","gtin");--> statement-breakpoint
CREATE INDEX "products_seller_status_idx" ON "products" USING btree ("seller_id","status","created_at");--> statement-breakpoint
CREATE INDEX "products_brand_idx" ON "products" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" USING btree ("category_id");
--> statement-breakpoint
-- ===== Elle eklenen bölüm (F3.3a) =====
-- Dört T tablosu (`seller_id`). Kiracı politikası yalnız kendi satırları; platform yalnız okur
-- (R39, US-016 AC5 listesi; `check-rls` PLATFORM_WRITE_FORBIDDEN_TABLES). Perakendeci bu
-- tablolara hiçbir politikayla erişemez: perakendecinin ürün listesi yalnız
-- `buyer_visible_products` (F3.12a) üzerinden. Modüller arası FK'lar (işletme, bölge) burada.
ALTER TABLE "products" ADD CONSTRAINT "products_seller_id_businesses_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "product_visibility" ADD CONSTRAINT "product_visibility_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
COMMENT ON TABLE "products" IS 'rls:T';
--> statement-breakpoint
COMMENT ON TABLE "product_variants" IS 'rls:T';
--> statement-breakpoint
COMMENT ON TABLE "product_packaging" IS 'rls:T';
--> statement-breakpoint
COMMENT ON TABLE "product_visibility" IS 'rls:T';
--> statement-breakpoint
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "products" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "product_variants" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "product_variants" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "product_packaging" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "product_packaging" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "product_visibility" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "product_visibility" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "products", "product_variants", "product_packaging", "product_visibility" FROM PUBLIC;
--> statement-breakpoint
-- 1) Kiracı politikaları. Ürün ve varyant silinmez (arşiv, K3): silme politikası ve izni yok.
CREATE POLICY "products_tenant_select" ON "products" FOR SELECT
  USING ("seller_id" = nullif(current_setting('app.business_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "products_tenant_insert" ON "products" FOR INSERT
  WITH CHECK ("seller_id" = nullif(current_setting('app.business_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "products_tenant_update" ON "products" FOR UPDATE
  USING ("seller_id" = nullif(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK ("seller_id" = nullif(current_setting('app.business_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "product_variants_tenant_select" ON "product_variants" FOR SELECT
  USING ("seller_id" = nullif(current_setting('app.business_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "product_variants_tenant_insert" ON "product_variants" FOR INSERT
  WITH CHECK ("seller_id" = nullif(current_setting('app.business_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "product_variants_tenant_update" ON "product_variants" FOR UPDATE
  USING ("seller_id" = nullif(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK ("seller_id" = nullif(current_setting('app.business_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "product_packaging_tenant" ON "product_packaging" FOR ALL
  USING ("seller_id" = nullif(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK ("seller_id" = nullif(current_setting('app.business_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "product_visibility_tenant" ON "product_visibility" FOR ALL
  USING ("seller_id" = nullif(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK ("seller_id" = nullif(current_setting('app.business_id', true), '')::uuid);
--> statement-breakpoint
-- 2) Platform yalnız okur (destek; R39). Yazma politikası asla eklenmez.
CREATE POLICY "products_platform_select" ON "products" FOR SELECT
  USING (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
CREATE POLICY "product_variants_platform_select" ON "product_variants" FOR SELECT
  USING (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
CREATE POLICY "product_packaging_platform_select" ON "product_packaging" FOR SELECT
  USING (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
CREATE POLICY "product_visibility_platform_select" ON "product_visibility" FOR SELECT
  USING (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
-- 3) Yalnız migrator sahipli DEFINER fonksiyonlarının içinde etkili (app_user migrator rolünü
--    üstlenemez): satıcı özeti kategorileri (S3) okur; marka reddi markayı boşaltır (V5).
CREATE POLICY "products_definer_select" ON "products" FOR SELECT TO migrator USING (true);
--> statement-breakpoint
CREATE POLICY "products_definer_brand_clear" ON "products" FOR UPDATE TO migrator
  USING (true)
  WITH CHECK ("brand_id" IS NULL);
--> statement-breakpoint
-- Kimlik ve taraf kolonları değişmez (UPDATE izni kolon düzeyinde).
GRANT SELECT, INSERT ON TABLE "products" TO app_user;
--> statement-breakpoint
GRANT UPDATE ("sku", "name", "description", "category_id", "brand_id", "base_unit_code", "has_expiry", "shelf_life_months", "status", "published_at", "updated_at") ON TABLE "products" TO app_user;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "product_variants" TO app_user;
--> statement-breakpoint
GRANT UPDATE ("sku", "attributes", "gtin", "is_available", "status", "sort_order", "updated_at") ON TABLE "product_variants" TO app_user;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON TABLE "product_packaging" TO app_user;
--> statement-breakpoint
GRANT UPDATE ("unit_code", "base_qty", "gtin", "weight_g", "dimensions_mm", "is_sales_unit", "min_order_qty", "order_multiple", "updated_at") ON TABLE "product_packaging" TO app_user;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON TABLE "product_visibility" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "products", "product_variants", "product_packaging", "product_visibility" TO readonly;
--> statement-breakpoint
-- 4) Marka reddi (V5, kart K6): `requested → rejected` olunca talep eden satıcının o markayı
--    taşıyan ürünlerinin markası boşalır. Tetikleyiciyle (admin uç noktası unutamaz); bildirim
--    F3.2a'daki `brand_request_rejected`. Doğrudan çağrılamaz (yalnız tetikleyici).
CREATE FUNCTION "product_brand_rejected_clear"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  UPDATE public.products
     SET brand_id = NULL,
         updated_at = now()
   WHERE brand_id = NEW.id
     AND seller_id = NEW.requested_by_business_id;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "product_brand_rejected_clear"() FROM PUBLIC;
--> statement-breakpoint
-- security-definer.int.test.ts kalıbı (D6); tetikleyici fonksiyonu doğrudan çağrılamaz.
GRANT EXECUTE ON FUNCTION "product_brand_rejected_clear"() TO app_user;
--> statement-breakpoint
CREATE TRIGGER "brands_rejected_clear_products"
  AFTER UPDATE OF "status" ON "brands"
  FOR EACH ROW
  WHEN (OLD."status" = 'requested' AND NEW."status" = 'rejected')
  EXECUTE FUNCTION "product_brand_rejected_clear"();
--> statement-breakpoint
-- 5) Satıcı özeti (S3 = A, US-023 AC1): `categories` = satıcının `active` ürünlerinin
--    kategorisinin aktif kök (depth 1) atası, `[{id, name}]` sıra numarasıyla. Taslak ve arşiv ürünler sayılmaz. Dönüş tipi
--    değiştiği için DROP + CREATE; ilişki şartı, sınır ve yetki 0023 ile aynı.
DROP FUNCTION "connection_seller_summaries"(uuid[]);
--> statement-breakpoint
CREATE FUNCTION "connection_seller_summaries"(p_ids uuid[])
  RETURNS TABLE (id uuid, legal_name text, description jsonb, logo_bucket text, logo_object_key text, categories jsonb)
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_buyer uuid;
BEGIN
  v_buyer := public.connection_assert_buyer_caller('connection_seller_summaries');
  IF coalesce(cardinality(p_ids), 0) > 50 THEN
    RAISE EXCEPTION 'connection_seller_summaries: en fazla 50 kimlik' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT b.id,
         b.legal_name,
         sp.description,
         f.bucket,
         f.object_key,
         coalesce((
           SELECT jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name)
                            ORDER BY r.sort_order, r.id)
             FROM public.categories r
            WHERE r.depth = 1
              AND r.is_active
              AND r.id IN (
                SELECT coalesce(c3.id, c2.id, c1.id)
                  FROM public.products p
                  JOIN public.categories c1 ON c1.id = p.category_id
                  LEFT JOIN public.categories c2 ON c2.id = c1.parent_id
                  LEFT JOIN public.categories c3 ON c3.id = c2.parent_id
                 WHERE p.seller_id = b.id
                   AND p.status = 'active'
              )
         ), '[]'::jsonb)
    FROM public.businesses b
    JOIN public.business_capabilities c
      ON c.business_id = b.id AND c.capability = 'seller'
    LEFT JOIN public.seller_profiles sp ON sp.business_id = b.id
    LEFT JOIN public.files f
      ON f.id = b.logo_file_id
     AND f.owner_business_id = b.id
     AND f.purpose = 'logo'
     AND f.status = 'ready'
   WHERE b.id = ANY (p_ids)
     AND (
       EXISTS (SELECT 1 FROM public.connection_requests r
                WHERE r.seller_id = b.id AND r.buyer_id = v_buyer)
       OR EXISTS (SELECT 1 FROM public.connections k
                   WHERE k.seller_id = b.id AND k.buyer_id = v_buyer)
       OR EXISTS (SELECT 1 FROM public.blocks bl
                   WHERE bl.seller_id = b.id AND bl.buyer_id = v_buyer)
     );
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "connection_seller_summaries"(uuid[]) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "connection_seller_summaries"(uuid[]) TO app_user;
