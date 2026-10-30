-- Elle eklenen bölüm aşağıda; drizzle-kit bu dosyayı yeniden üretmez.
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_business_id" uuid,
	"purpose" text NOT NULL,
	"bucket" text NOT NULL,
	"object_key" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "files_object_key_uq" UNIQUE("object_key"),
	CONSTRAINT "files_owner_business_id_id_uq" UNIQUE("owner_business_id","id"),
	CONSTRAINT "files_purpose_check" CHECK ("files"."purpose" in ('product_image', 'logo', 'delivery_photo', 'dispute_photo', 'import')),
	CONSTRAINT "files_bucket_check" CHECK ("files"."bucket" in ('public', 'private')),
	CONSTRAINT "files_status_check" CHECK ("files"."status" in ('pending', 'ready', 'rejected')),
	CONSTRAINT "files_size_bytes_check" CHECK ("files"."size_bytes" > 0)
);
--> statement-breakpoint
-- FK'lar elle (files modülü businesses ve identity şemasını içe aktarmaz, c4-component §1).
ALTER TABLE "files" ADD CONSTRAINT "files_owner_business_id_businesses_id_fk" FOREIGN KEY ("owner_business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- F1.7'de FK'sız bırakılan logo (faz spes. §6.10). Bileşik: işletme yalnızca kendi dosyasını logo
-- yapabilir (FK denetimi RLS dışıdır; F1.8a kuralı). logo_file_id null ise denetlenmez.
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_logo_file_fk" FOREIGN KEY ("id","logo_file_id") REFERENCES "public"."files"("owner_business_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
COMMENT ON TABLE "files" IS 'rls:T';
--> statement-breakpoint
ALTER TABLE "files" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "files" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "files" FROM PUBLIC;
--> statement-breakpoint
-- Kiracı: yalnızca kendi dosyaları. Platform dosyası (owner_business_id null) burada hiç görünmez.
CREATE POLICY "files_tenant" ON "files" FOR ALL
  USING ("owner_business_id" = nullif(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK ("owner_business_id" = nullif(current_setting('app.business_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "files_platform" ON "files" FOR ALL
  USING (current_setting('app.is_platform', true) = 'true')
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
-- DELETE yok: reddedilen dosyanın satırı rejected olarak kalır (data-model §4.3).
GRANT SELECT, INSERT, UPDATE ON TABLE "files" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "files" TO readonly;
