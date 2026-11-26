-- F3.6a fiyat listeleri (US-034, ADR-0019; data-model §4.9 `pricing`; kart K1–K10, K2 = A).
-- Elle eklenen bölüm aşağıda (modüller arası FK'lar, dizinler, RLS, GRANT).
CREATE TABLE "price_list_items" (
	"price_list_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"packaging_id" uuid NOT NULL,
	"unit_price" numeric(14, 4) NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "price_list_items_pk" PRIMARY KEY("price_list_id","packaging_id","valid_from"),
	CONSTRAINT "price_list_items_unit_price_check" CHECK ("price_list_items"."unit_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "price_lists" (
	"id" uuid PRIMARY KEY NOT NULL,
	"seller_id" uuid NOT NULL,
	"name" text NOT NULL,
	"currency_code" char(3) NOT NULL,
	"vat_included" boolean NOT NULL,
	"vat_rate" numeric(5, 2) NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_lists_id_seller_uq" UNIQUE("id","seller_id"),
	CONSTRAINT "price_lists_status_check" CHECK ("price_lists"."status" in ('active', 'archived')),
	CONSTRAINT "price_lists_vat_rate_check" CHECK ("price_lists"."vat_rate" >= 0 and "price_lists"."vat_rate" <= 100),
	CONSTRAINT "price_lists_name_check" CHECK (char_length(btrim("price_lists"."name")) between 1 and 120),
	CONSTRAINT "price_lists_default_active_check" CHECK (not "price_lists"."is_default" or "price_lists"."status" = 'active')
);
--> statement-breakpoint
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_list_fk" FOREIGN KEY ("price_list_id","seller_id") REFERENCES "public"."price_lists"("id","seller_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "price_lists_one_default_uq" ON "price_lists" USING btree ("seller_id") WHERE "price_lists"."is_default";--> statement-breakpoint
ALTER TABLE "product_packaging" ADD CONSTRAINT "product_packaging_id_seller_uq" UNIQUE("id","seller_id");
--> statement-breakpoint
-- ===== Elle eklenen bölüm (F3.6a) =====
-- İki T tablosu (`seller_id`). Kiracı yalnız kendi satırları; platform yalnız okur (R39, `check-rls`
-- PLATFORM_WRITE_FORBIDDEN_TABLES). Perakendeci hiçbir politikayla erişemez: alıcı fiyatı yalnız
-- `PriceResolver` üzerinden (F3.12a). Bileşik FK'lar başka satıcının listesine/ambalajına bağlamayı
-- RLS'ten bağımsız engeller (FK denetimi RLS'e bakmaz, F1.8a kuralı).
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_seller_id_businesses_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_currency_code_currencies_code_fk" FOREIGN KEY ("currency_code") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Ambalaj seviyesi ürün düzenlemesinde silinebilir (F3.3a); fiyatları da silinir. Geçmiş siparişler
-- fiyatı kopyalar (ADR-0019), bu satırlara bağlı değildir.
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_packaging_fk" FOREIGN KEY ("packaging_id","seller_id") REFERENCES "public"."product_packaging"("id","seller_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "price_list_items_packaging_idx" ON "price_list_items" USING btree ("packaging_id");
--> statement-breakpoint
CREATE INDEX "price_lists_seller_idx" ON "price_lists" USING btree ("seller_id", "status");
--> statement-breakpoint
-- Bağlantıya atanmış liste (US-024 AC2; F2.14a'da FK'sız bırakıldı). Yalnız aynı satıcının listesi.
ALTER TABLE "connections" ADD CONSTRAINT "connections_price_list_fk" FOREIGN KEY ("price_list_id","seller_id") REFERENCES "public"."price_lists"("id","seller_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "connections_price_list_idx" ON "connections" USING btree ("price_list_id") WHERE "price_list_id" IS NOT NULL;
--> statement-breakpoint
-- Satıcı profilindeki varsayılan liste (ai-context "F3"); `price_lists.is_default` ile aynı işlemde yazılır (K1).
ALTER TABLE "seller_profiles" ADD CONSTRAINT "seller_profiles_default_price_list_fk" FOREIGN KEY ("default_price_list_id","business_id") REFERENCES "public"."price_lists"("id","seller_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
COMMENT ON TABLE "price_lists" IS 'rls:T';
--> statement-breakpoint
COMMENT ON TABLE "price_list_items" IS 'rls:T';
--> statement-breakpoint
ALTER TABLE "price_lists" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "price_lists" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "price_list_items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "price_list_items" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "price_lists", "price_list_items" FROM PUBLIC;
--> statement-breakpoint
CREATE POLICY "price_lists_tenant" ON "price_lists" FOR ALL
  USING ("seller_id" = nullif(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK ("seller_id" = nullif(current_setting('app.business_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "price_list_items_tenant" ON "price_list_items" FOR ALL
  USING ("seller_id" = nullif(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK ("seller_id" = nullif(current_setting('app.business_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "price_lists_platform_select" ON "price_lists" FOR SELECT
  USING (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
CREATE POLICY "price_list_items_platform_select" ON "price_list_items" FOR SELECT
  USING (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
-- Liste ve fiyat satırı silinmez (liste arşivlenir, K3; fiyat geçmişi korunur, K5). Fiyat satırında
-- güncellenebilen yalnız henüz geçerli olmayan satırın fiyatı (servis denetler).
GRANT SELECT, INSERT ON TABLE "price_lists" TO app_user;
--> statement-breakpoint
GRANT UPDATE ("name", "vat_included", "vat_rate", "is_default", "status", "updated_at") ON TABLE "price_lists" TO app_user;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "price_list_items" TO app_user;
--> statement-breakpoint
GRANT UPDATE ("unit_price") ON TABLE "price_list_items" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "price_lists", "price_list_items" TO readonly;
