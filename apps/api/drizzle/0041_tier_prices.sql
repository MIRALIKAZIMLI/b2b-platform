-- F3.9 kademeli fiyat (US-037 AC1, ADR-0019; data-model §4.9 `tier_prices`; kart docs/tasks/F3.9.md;
-- kullanıcı kararları S1 = A web bölümü, S2 = A artan indirim + ayar sınırı).
-- Elle eklenen bölüm aşağıda (modüller arası FK'lar, RLS, GRANT).
CREATE TABLE "tier_prices" (
	"seller_id" uuid NOT NULL,
	"packaging_id" uuid NOT NULL,
	"min_qty" numeric(14, 3) NOT NULL,
	"discount_percent" numeric(5, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "tier_prices_pk" PRIMARY KEY("seller_id","packaging_id","min_qty"),
	CONSTRAINT "tier_prices_min_qty_check" CHECK ("tier_prices"."min_qty" > 1),
	CONSTRAINT "tier_prices_discount_percent_check" CHECK ("tier_prices"."discount_percent" > 0 and "tier_prices"."discount_percent" < 100)
);
--> statement-breakpoint
-- ===== Elle eklenen bölüm (F3.9) =====
-- T tablosu (`seller_id`): kiracı yalnız kendi satırları, platform yalnız okur (R39, `check-rls`
-- PLATFORM_WRITE_FORBIDDEN_TABLES), perakendeciye hiçbir politika yok (alıcı kademeyi yalnız
-- `PriceResolver` sonucunda görür). `buyer_id` yok: arşiv tetikleyicisi (R40) gerekmez. Bileşik
-- ambalaj FK'sı başka satıcının ambalajına kademe yazmayı RLS'ten bağımsız engeller; ambalaj seviyesi
-- silinince kademeleri de silinir (liste ve müşteri fiyatıyla aynı). Kaskad araması PK önekini
-- `(seller_id, packaging_id)` kullanır; ayrı dizin gerekmez.
ALTER TABLE "tier_prices" ADD CONSTRAINT "tier_prices_seller_id_businesses_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tier_prices" ADD CONSTRAINT "tier_prices_packaging_fk" FOREIGN KEY ("packaging_id","seller_id") REFERENCES "public"."product_packaging"("id","seller_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
COMMENT ON TABLE "tier_prices" IS 'rls:T';
--> statement-breakpoint
ALTER TABLE "tier_prices" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tier_prices" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "tier_prices" FROM PUBLIC;
--> statement-breakpoint
CREATE POLICY "tier_prices_tenant" ON "tier_prices" FOR ALL
  USING ("seller_id" = nullif(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK ("seller_id" = nullif(current_setting('app.business_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "tier_prices_platform_select" ON "tier_prices" FOR SELECT
  USING (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
-- `PUT /tier-prices` bir ambalajın bütün kademelerini siler ve yeniden yazar; UPDATE gerekmez.
GRANT SELECT, INSERT, DELETE ON TABLE "tier_prices" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "tier_prices" TO readonly;
