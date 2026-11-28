CREATE TABLE "stock" (
	"seller_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"on_hand" numeric(14, 3) DEFAULT '0' NOT NULL,
	"reserved" numeric(14, 3) DEFAULT '0' NOT NULL,
	"low_threshold" numeric(14, 3),
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "stock_pk" PRIMARY KEY("seller_id","warehouse_id","variant_id"),
	CONSTRAINT "stock_on_hand_check" CHECK ("stock"."on_hand" >= 0),
	CONSTRAINT "stock_reserved_check" CHECK ("stock"."reserved" >= 0 and "stock"."reserved" <= "stock"."on_hand"),
	CONSTRAINT "stock_low_threshold_check" CHECK ("stock"."low_threshold" is null or "stock"."low_threshold" >= 0)
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"seller_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"type" text NOT NULL,
	"on_hand_delta" numeric(14, 3) NOT NULL,
	"reserved_delta" numeric(14, 3) DEFAULT '0' NOT NULL,
	"order_id" uuid,
	"lot_no" text,
	"expiry_date" date,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "stock_movements_type_check" CHECK ("stock_movements"."type" in ('receipt', 'reserve', 'release', 'ship', 'return', 'adjustment')),
	CONSTRAINT "stock_movements_receipt_check" CHECK ("stock_movements"."type" <> 'receipt' or ("stock_movements"."on_hand_delta" > 0 and "stock_movements"."reserved_delta" = 0)),
	CONSTRAINT "stock_movements_adjustment_check" CHECK ("stock_movements"."type" <> 'adjustment' or "stock_movements"."reserved_delta" = 0),
	CONSTRAINT "stock_movements_lot_no_check" CHECK ("stock_movements"."lot_no" is null or char_length("stock_movements"."lot_no") between 1 and 64),
	CONSTRAINT "stock_movements_note_check" CHECK ("stock_movements"."note" is null or char_length("stock_movements"."note") between 1 and 500)
);
--> statement-breakpoint
CREATE INDEX "stock_variant_idx" ON "stock" USING btree ("seller_id","variant_id");--> statement-breakpoint
CREATE INDEX "stock_movements_stock_idx" ON "stock_movements" USING btree ("seller_id","warehouse_id","variant_id","created_at");--> statement-breakpoint
CREATE INDEX "stock_movements_seller_created_idx" ON "stock_movements" USING btree ("seller_id","created_at","id");
--> statement-breakpoint
-- ===== Elle eklenen bölüm (F3.11a; US-039 AC1, AC7, ADR-0018, R35, R36, R39) =====
-- 1) Bileşik FK'lar: stok satırı yalnız satıcının kendi deposuna ve kendi varyantına bağlanır (FK
--    kontrolü RLS'e bakmaz); hareket yalnız var olan stok satırına bağlanır (satırı tetikleyici açar).
--    Varyant ve depo silinmez (arşiv / pasif), bu yüzden kaskad yok.
ALTER TABLE "stock" ADD CONSTRAINT "stock_seller_id_businesses_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock" ADD CONSTRAINT "stock_warehouse_fk" FOREIGN KEY ("seller_id","warehouse_id") REFERENCES "public"."warehouses"("business_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock" ADD CONSTRAINT "stock_variant_fk" FOREIGN KEY ("variant_id","seller_id") REFERENCES "public"."product_variants"("id","seller_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_stock_fk" FOREIGN KEY ("seller_id","warehouse_id","variant_id") REFERENCES "public"."stock"("seller_id","warehouse_id","variant_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- 2) T tabloları: kiracı yalnız kendi satırları, platform yalnız okur (R39, `check-rls`
--    PLATFORM_WRITE_FORBIDDEN_TABLES), perakendeciye politika yok (gösterim F3.12a'da). Politikalar
--    rol sınırlamasız: tetikleyici fonksiyonu (migrator) aynı `app.business_id` ile yalnız işlemin
--    kiracısının stok satırını açar/günceller.
COMMENT ON TABLE "stock" IS 'rls:T';
--> statement-breakpoint
COMMENT ON TABLE "stock_movements" IS 'rls:T';
--> statement-breakpoint
ALTER TABLE "stock" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "stock" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "stock_movements" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "stock_movements" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "stock" FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON TABLE "stock_movements" FROM PUBLIC;
--> statement-breakpoint
CREATE POLICY "stock_tenant" ON "stock" FOR ALL
  USING ("seller_id" = nullif(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK ("seller_id" = nullif(current_setting('app.business_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "stock_platform_select" ON "stock" FOR SELECT
  USING (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
CREATE POLICY "stock_movements_tenant" ON "stock_movements" FOR ALL
  USING ("seller_id" = nullif(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK ("seller_id" = nullif(current_setting('app.business_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "stock_movements_platform_select" ON "stock_movements" FOR SELECT
  USING (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
-- 3) Stok yalnız hareketle değişir (R35, US-039 AC7): `app_user` stok satırına yazamaz; hareketi
--    yalnız ekler (UPDATE / DELETE yok). Satırı hareket tetikleyicisi açar ve günceller.
GRANT SELECT ON TABLE "stock" TO app_user;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "stock_movements" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "stock", "stock_movements" TO readonly;
--> statement-breakpoint
-- 4) Hareket tetikleyicisi (BEFORE INSERT; stok satırı FK kontrolünden önce var olur). Delta'lar
--    satıra eklenir; sonuç CHECK'i ihlal ederse (`on_hand < 0`, `reserved > on_hand`) hareket de
--    geri alınır (23514). Eşzamanlı iki hareket aynı satırın güncelleme kilidinde sıralanır. D6: migrator sahipli, search_path pg_temp ile biter, PUBLIC yok, app_user EXECUTE
--    (security-definer.int.test.ts kalıbı); tetikleyici fonksiyonu doğrudan çağrılamaz.
CREATE FUNCTION "stock_movements_apply"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  -- Önce güncelleme: INSERT ... ON CONFLICT CHECK'i eklenecek satırın kendisinde (delta'larla)
  -- denetler, eksi delta'lı hareket var olan satırda da reddedilirdi. Satır yoksa eklenir; aynı anda
  -- iki ilk hareket gelirse ikincisi tekil ihlalinden sonra güncellemeye döner.
  LOOP
    UPDATE public.stock
       SET on_hand = on_hand + NEW.on_hand_delta,
           reserved = reserved + NEW.reserved_delta,
           updated_at = greatest(updated_at, NEW.created_at)
     WHERE seller_id = NEW.seller_id
       AND warehouse_id = NEW.warehouse_id
       AND variant_id = NEW.variant_id;
    IF FOUND THEN
      RETURN NEW;
    END IF;
    BEGIN
      INSERT INTO public.stock (seller_id, warehouse_id, variant_id, on_hand, reserved, updated_at)
      VALUES (NEW.seller_id, NEW.warehouse_id, NEW.variant_id, NEW.on_hand_delta,
              NEW.reserved_delta, NEW.created_at);
      RETURN NEW;
    EXCEPTION WHEN unique_violation THEN
      -- Eşzamanlı ilk hareket satırı açtı; döngü güncellemeyle sürer.
    END;
  END LOOP;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "stock_movements_apply"() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "stock_movements_apply"() TO app_user;
--> statement-breakpoint
CREATE TRIGGER "stock_movements_apply"
  BEFORE INSERT ON "stock_movements"
  FOR EACH ROW
  EXECUTE FUNCTION "stock_movements_apply"();
