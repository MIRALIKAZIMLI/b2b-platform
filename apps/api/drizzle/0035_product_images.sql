-- F3.4a ürün görselleri (US-030 AC3; data-model §4.8 `product_images`; kart K1–K12).
-- Elle eklenen bölüm aşağıda (dosya FK'sı, RLS, GRANT).
CREATE TABLE "product_images" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"sort_order" smallint NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_images_file_uq" UNIQUE("file_id"),
	CONSTRAINT "product_images_status_check" CHECK ("product_images"."status" in ('processing', 'ready', 'failed')),
	CONSTRAINT "product_images_sort_order_check" CHECK ("product_images"."sort_order" >= 0)
);
--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_fk" FOREIGN KEY ("product_id","seller_id") REFERENCES "public"."products"("id","seller_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_images_product_idx" ON "product_images" USING btree ("product_id","sort_order");
--> statement-breakpoint
-- ===== Elle eklenen bölüm (F3.4a) =====
-- T tablosu (`seller_id`). Kiracı yalnız kendi satırları; platform yalnız okur (R39,
-- `check-rls` PLATFORM_WRITE_FORBIDDEN_TABLES). Perakendeci bu tabloya hiçbir politikayla erişemez
-- (perakendeci görünümü F3.12a). Dosya bileşik FK ile aynı işletmenin dosyası olmalı (K9; FK
-- denetimi RLS dışıdır, F1.8a kuralı).
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_file_fk" FOREIGN KEY ("seller_id","file_id") REFERENCES "public"."files"("owner_business_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
COMMENT ON TABLE "product_images" IS 'rls:T';
--> statement-breakpoint
ALTER TABLE "product_images" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "product_images" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "product_images" FROM PUBLIC;
--> statement-breakpoint
CREATE POLICY "product_images_tenant" ON "product_images" FOR ALL
  USING ("seller_id" = nullif(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK ("seller_id" = nullif(current_setting('app.business_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "product_images_platform_select" ON "product_images" FOR SELECT
  USING (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
-- Satır silinebilir (K7). Güncellenebilen yalnız sıra ve işleme durumu (worker, K11).
GRANT SELECT, INSERT, DELETE ON TABLE "product_images" TO app_user;
--> statement-breakpoint
GRANT UPDATE ("sort_order", "status", "updated_at") ON TABLE "product_images" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "product_images" TO readonly;
