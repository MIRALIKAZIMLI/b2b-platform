-- F3.2a kategori, marka, faaliyet alanı (US-029; data-model §4.8 `categories`, `brands`).
-- Elle eklenen bölüm aşağıda (RLS, tetikleyici, SECURITY DEFINER, activity_types silme politikası).
CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"requested_by_business_id" uuid,
	"requested_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"decided_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brands_status_check" CHECK ("brands"."status" in ('requested', 'active', 'rejected')),
	CONSTRAINT "brands_requested_by_check" CHECK ("brands"."status" <> 'requested' or "brands"."requested_by_business_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"name" jsonb NOT NULL,
	"depth" smallint NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_depth_check" CHECK ("categories"."depth" between 1 and 3)
);
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "brands_name_uq" ON "brands" USING btree (lower(btrim("name"))) WHERE "brands"."status" <> 'rejected';--> statement-breakpoint
CREATE INDEX "brands_requested_by_idx" ON "brands" USING btree ("requested_by_business_id","created_at");--> statement-breakpoint
CREATE INDEX "categories_parent_idx" ON "categories" USING btree ("parent_id");
--> statement-breakpoint
-- ===== Elle eklenen bölüm (F3.2a) =====
-- G sınıfı (F1.3 kalıbı): yazma yalnız platform bağlamında. Silme politikası ve DELETE izni yok
-- (R38: katalog kaydı silinmez, pasifleşir). `brands` okuması kısıtlı (V5): aktif markalar herkese,
-- talep edilmiş / reddedilmiş marka yalnız talep eden işletmeye ve platforma. Toptancının talebi
-- yalnız `brand_request_create` (migrator sahipli SECURITY DEFINER, R37) ile yazılır.
ALTER TABLE "brands" ADD CONSTRAINT "brands_requested_by_business_id_businesses_id_fk" FOREIGN KEY ("requested_by_business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- 1) Kategori derinliği (R38, US-029 VARSAYIM ≤ 3): `depth` her zaman üstten hesaplanır (istemci
--    değeri yok sayılır); üst kategori sonradan değişmez (kart K4). İkinci savunma; API 422 verir.
CREATE FUNCTION "categories_guard"()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_parent_depth smallint;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.parent_id IS DISTINCT FROM OLD.parent_id THEN
    RAISE EXCEPTION 'categories: üst kategori değiştirilemez' USING ERRCODE = '23514';
  END IF;
  IF NEW.parent_id IS NULL THEN
    NEW.depth := 1;
  ELSE
    SELECT c.depth INTO v_parent_depth FROM public.categories c WHERE c.id = NEW.parent_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'categories: üst kategori yok' USING ERRCODE = '23503';
    END IF;
    NEW.depth := v_parent_depth + 1;
  END IF;
  IF NEW.depth > 3 THEN
    RAISE EXCEPTION 'categories: en çok 3 seviye' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "categories_guard"() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER "categories_guard"
  BEFORE INSERT OR UPDATE ON "categories"
  FOR EACH ROW EXECUTE FUNCTION "categories_guard"();
--> statement-breakpoint
COMMENT ON TABLE "categories" IS 'rls:G';
--> statement-breakpoint
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "categories" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "categories" FROM PUBLIC;
--> statement-breakpoint
CREATE POLICY "categories_read" ON "categories" FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY "categories_platform_insert" ON "categories" FOR INSERT
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
CREATE POLICY "categories_platform_update" ON "categories" FOR UPDATE
  USING (current_setting('app.is_platform', true) = 'true')
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "categories" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "categories" TO readonly;
--> statement-breakpoint
-- 2) Markalar.
COMMENT ON TABLE "brands" IS 'rls:G';
--> statement-breakpoint
ALTER TABLE "brands" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "brands" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "brands" FROM PUBLIC;
--> statement-breakpoint
CREATE POLICY "brands_read" ON "brands" FOR SELECT USING (
  "status" = 'active'
  OR "requested_by_business_id" = nullif(current_setting('app.business_id', true), '')::uuid
  OR current_setting('app.is_platform', true) = 'true'
);
--> statement-breakpoint
CREATE POLICY "brands_platform_insert" ON "brands" FOR INSERT
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
CREATE POLICY "brands_platform_update" ON "brands" FOR UPDATE
  USING (current_setting('app.is_platform', true) = 'true')
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
-- Yalnız DEFINER fonksiyonunun içinde etkili (app_user migrator rolünü üstlenemez).
CREATE POLICY "brands_definer_insert" ON "brands" FOR INSERT TO migrator
  WITH CHECK (
    "status" = 'requested'
    AND "requested_by_business_id" = nullif(current_setting('app.business_id', true), '')::uuid
  );
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "brands" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "brands" TO readonly;
--> statement-breakpoint
-- 3) Marka talebi (US-029 AC2, R37): çağıran bağlam onaylı `seller` yetenekli, aktif işletme ve
--    `p_user_id` onun aktif üyesi olmalı (aksi `42501`). İşletme başına kilit; son 24 saatteki
--    talep sayısı `p_limit`e (ayar `catalog.brand_request_daily_limit`) ulaştıysa `CT001`
--    (API 429). Durum her zaman `requested`. Ad çakışması `brands_name_uq` (23505, API 422).
CREATE FUNCTION "brand_request_create"(
  p_id uuid,
  p_name text,
  p_user_id uuid,
  p_limit integer,
  p_now timestamptz
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_business uuid := nullif(current_setting('app.business_id', true), '')::uuid;
  v_platform boolean := coalesce(nullif(current_setting('app.is_platform', true), ''), 'false') = 'true';
  v_name text := btrim(p_name);
  v_count integer;
BEGIN
  IF v_business IS NULL OR v_platform THEN
    RAISE EXCEPTION 'brand_request_create: toptancı bağlamı gerekli' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM public.business_capabilities c
      JOIN public.businesses b ON b.id = c.business_id
     WHERE c.business_id = v_business
       AND c.capability = 'seller'
       AND c.status = 'approved'
       AND b.status = 'active'
  ) THEN
    RAISE EXCEPTION 'brand_request_create: onaylı toptancı bağlamı gerekli' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.memberships m
     WHERE m.user_id = p_user_id AND m.business_id = v_business AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'brand_request_create: işletmenin aktif üyesi değil' USING ERRCODE = '42501';
  END IF;
  IF p_id IS NULL OR p_now IS NULL OR p_limit IS NULL OR p_limit < 1 OR p_limit > 1000
     OR v_name IS NULL OR char_length(v_name) < 1 OR char_length(v_name) > 80 THEN
    RAISE EXCEPTION 'brand_request_create: geçersiz değer' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('brand_request:' || v_business::text, 0));
  SELECT count(*) INTO v_count
    FROM public.brands br
   WHERE br.requested_by_business_id = v_business
     AND br.created_at > p_now - interval '24 hours';
  IF v_count >= p_limit THEN
    RAISE EXCEPTION 'BRAND_REQUEST_LIMIT' USING ERRCODE = 'CT001';
  END IF;

  INSERT INTO public.brands
    (id, name, status, is_active, requested_by_business_id, requested_by_user_id, created_at, updated_at)
  VALUES (p_id, v_name, 'requested', true, v_business, p_user_id, p_now, p_now);
  RETURN p_id;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "brand_request_create"(uuid, text, uuid, integer, timestamptz) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "brand_request_create"(uuid, text, uuid, integer, timestamptz) TO app_user;
--> statement-breakpoint
-- 4) Faaliyet alanı silinmez (R38). Silme politikası kalkar: platform bağlamında bile silme 0 satır
--    etkiler. DELETE izni 0004'teki F1.7 testleri (kiracı bağlamında 0 satır) için korunur.
DROP POLICY "activity_types_platform_delete" ON "activity_types";