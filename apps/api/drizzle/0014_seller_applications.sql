-- Elle eklenen bölüm aşağıda; drizzle-kit bu dosyayı yeniden üretmez.
CREATE TABLE "seller_applications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"legal_name" text NOT NULL,
	"voen" char(10) NOT NULL,
	"contact_name" text NOT NULL,
	"phone_e164" text NOT NULL,
	"region_id" uuid NOT NULL,
	"category_note" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"business_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seller_applications_voen_format_check" CHECK ("seller_applications"."voen" ~ '^[0-9]{9}[12]$'),
	CONSTRAINT "seller_applications_status_check" CHECK ("seller_applications"."status" in ('pending', 'approved', 'rejected')),
	CONSTRAINT "seller_applications_category_note_check" CHECK ("seller_applications"."category_note" is null or char_length("seller_applications"."category_note") <= 500),
	CONSTRAINT "seller_applications_review_check" CHECK (("seller_applications"."status" = 'pending' and "seller_applications"."reviewed_by" is null and "seller_applications"."business_id" is null)
        or ("seller_applications"."status" = 'approved' and "seller_applications"."reviewed_by" is not null and "seller_applications"."business_id" is not null)
        or ("seller_applications"."status" = 'rejected' and "seller_applications"."reviewed_by" is not null and "seller_applications"."business_id" is null))
);
--> statement-breakpoint
ALTER TABLE "seller_applications" ADD CONSTRAINT "seller_applications_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_applications" ADD CONSTRAINT "seller_applications_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "seller_applications_voen_pending_uq" ON "seller_applications" USING btree ("voen") WHERE "seller_applications"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "seller_applications_status_id_idx" ON "seller_applications" USING btree ("status","id");--> statement-breakpoint
-- F2.2: toptancı başvurusu (US-008; data-model §4.4, state-machines §12).
ALTER TABLE "seller_applications" ADD CONSTRAINT "seller_applications_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id");
--> statement-breakpoint
-- G sınıfının istisnası: kişisel veri (contact_name, phone_e164) taşıdığı için okuma da yalnızca
-- platform bağlamında. Silme yok.
COMMENT ON TABLE "seller_applications" IS 'rls:G';
--> statement-breakpoint
ALTER TABLE "seller_applications" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "seller_applications" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "seller_applications" FROM PUBLIC;
--> statement-breakpoint
CREATE POLICY "seller_applications_platform_select" ON "seller_applications" FOR SELECT
  USING (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
CREATE POLICY "seller_applications_platform_update" ON "seller_applications" FOR UPDATE
  USING (current_setting('app.is_platform', true) = 'true')
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
-- Kimliksiz başvuru: yalnızca aşağıdaki SECURITY DEFINER fonksiyonun içinde etkilidir (app_user
-- migrator rolünü üstlenemez). Yalnızca incelenmemiş `pending` satır yazılabilir.
CREATE POLICY "seller_applications_definer_insert" ON "seller_applications" FOR INSERT TO migrator
  WITH CHECK ("status" = 'pending' AND "reviewed_by" IS NULL AND "business_id" IS NULL);
--> statement-breakpoint
GRANT SELECT, UPDATE ON TABLE "seller_applications" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "seller_applications" TO readonly;
--> statement-breakpoint
-- Kimliksiz başvuru (withSystemTx; bağlam yok). Aynı VÖEN ile `pending` başvuru varsa kısmi
-- benzersiz indeks 23505 (seller_applications_voen_pending_uq), bilinmeyen bölge FK 23503 verir;
-- uygulama bunları 409 / 422'ye çevirir. Kimlik uygulamanın UUIDv7 üreticisinden, zaman Clock'tan.
CREATE FUNCTION "seller_application_submit"(
  p_id uuid,
  p_legal_name text,
  p_voen text,
  p_contact_name text,
  p_phone_e164 text,
  p_region_id uuid,
  p_category_note text,
  p_now timestamptz
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  INSERT INTO public.seller_applications
    (id, legal_name, voen, contact_name, phone_e164, region_id, category_note, status,
     created_at, updated_at)
  VALUES
    (p_id, p_legal_name, p_voen, p_contact_name, p_phone_e164, p_region_id, p_category_note,
     'pending', p_now, p_now);
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "seller_application_submit"(uuid, text, text, text, text, uuid, text, timestamptz) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "seller_application_submit"(uuid, text, text, text, text, uuid, text, timestamptz) TO app_user;
