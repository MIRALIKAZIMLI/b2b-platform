CREATE TABLE "blocks" (
	"buyer_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocks_buyer_id_seller_id_pk" PRIMARY KEY("buyer_id","seller_id")
);
--> statement-breakpoint
CREATE TABLE "connection_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"seller_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"sent_by_user_id" uuid NOT NULL,
	"message" text,
	"proposed_payment_term_days" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"responded_at" timestamp with time zone,
	"responded_by_user_id" uuid,
	"seller_local_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connection_requests_status_check" CHECK ("connection_requests"."status" in ('pending', 'accepted', 'rejected', 'expired', 'withdrawn')),
	CONSTRAINT "connection_requests_pair_check" CHECK ("connection_requests"."seller_id" <> "connection_requests"."buyer_id"),
	CONSTRAINT "connection_requests_message_check" CHECK ("connection_requests"."message" is null or char_length("connection_requests"."message") <= 500),
	CONSTRAINT "connection_requests_term_check" CHECK ("connection_requests"."proposed_payment_term_days" is null or "connection_requests"."proposed_payment_term_days" between 0 and 180)
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"seller_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"price_list_id" uuid,
	"branch_pricing_enabled" boolean DEFAULT false NOT NULL,
	"credit_limit" numeric(14, 2),
	"payment_term_days" integer DEFAULT 0 NOT NULL,
	"sales_rep_membership_id" uuid,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"ended_by_side" text,
	"end_reason" text,
	"ended_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connections_status_check" CHECK ("connections"."status" in ('active', 'cancelled')),
	CONSTRAINT "connections_ended_by_side_check" CHECK ("connections"."ended_by_side" is null or "connections"."ended_by_side" in ('seller', 'buyer')),
	CONSTRAINT "connections_cancel_fields_check" CHECK (("connections"."status" = 'active' and "connections"."ended_at" is null and "connections"."ended_by_side" is null)
          or ("connections"."status" = 'cancelled' and "connections"."ended_at" is not null and "connections"."ended_by_side" is not null)),
	CONSTRAINT "connections_pair_check" CHECK ("connections"."seller_id" <> "connections"."buyer_id"),
	CONSTRAINT "connections_credit_limit_check" CHECK ("connections"."credit_limit" is null or "connections"."credit_limit" >= 0),
	CONSTRAINT "connections_payment_term_check" CHECK ("connections"."payment_term_days" between 0 and 180)
);
--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_buyer_id_businesses_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_seller_id_businesses_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection_requests" ADD CONSTRAINT "connection_requests_seller_id_businesses_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection_requests" ADD CONSTRAINT "connection_requests_buyer_id_businesses_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_seller_id_businesses_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_buyer_id_businesses_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_request_id_connection_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."connection_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "connection_requests_pending_pair_uq" ON "connection_requests" USING btree ("seller_id","buyer_id") WHERE "connection_requests"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "connection_requests_seller_day_idx" ON "connection_requests" USING btree ("seller_id","seller_local_date");--> statement-breakpoint
CREATE INDEX "connection_requests_buyer_status_idx" ON "connection_requests" USING btree ("buyer_id","status");--> statement-breakpoint
CREATE INDEX "connection_requests_pending_expires_idx" ON "connection_requests" USING btree ("expires_at") WHERE "connection_requests"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "connections_active_pair_uq" ON "connections" USING btree ("seller_id","buyer_id") WHERE "connections"."status" = 'active';--> statement-breakpoint
CREATE INDEX "connections_buyer_active_idx" ON "connections" USING btree ("buyer_id") WHERE "connections"."status" = 'active';--> statement-breakpoint
CREATE INDEX "connections_seller_buyer_idx" ON "connections" USING btree ("seller_id","buyer_id");--> statement-breakpoint
-- ===== Elle eklenen bölüm (F2.12a: bağlantı isteği, US-021, SF-03, R18, R23) =====
-- İlk P (çift kiracı) tabloları: satır, satıcı (`seller_id`) veya alıcı (`buyer_id`) bağlamdaysa
-- görünür (data-model §1.1). İstek yalnız satıcı tarafından eklenir; bağlantı yalnız alıcı
-- tarafından (kabul, F2.13). Silme politikası yok (iş kaydı silinmez). Platform yalnız okur
-- (moderasyon ve birleştirme yazmaları F2.18'de kendi politikasıyla gelir).
-- `blocks` T sınıfı (alıcı): satıcı engeli yalnız connection_buyer_targets ile var/yok olarak görür.
--
-- users FK'ları burada (connections → identity bağımlılığı yok; F1.5a kalıbı).
ALTER TABLE "connection_requests" ADD CONSTRAINT "connection_requests_sent_by_user_id_users_id_fk"
  FOREIGN KEY ("sent_by_user_id") REFERENCES "public"."users"("id");
--> statement-breakpoint
ALTER TABLE "connection_requests" ADD CONSTRAINT "connection_requests_responded_by_user_id_users_id_fk"
  FOREIGN KEY ("responded_by_user_id") REFERENCES "public"."users"("id");
--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_ended_by_user_id_users_id_fk"
  FOREIGN KEY ("ended_by_user_id") REFERENCES "public"."users"("id");
--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_created_by_user_id_users_id_fk"
  FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id");
--> statement-breakpoint
COMMENT ON TABLE "connection_requests" IS 'rls:P';
--> statement-breakpoint
ALTER TABLE "connection_requests" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "connection_requests" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "connection_requests" FROM PUBLIC;
--> statement-breakpoint
CREATE POLICY "connection_requests_party_select" ON "connection_requests" FOR SELECT
  USING ("seller_id" = nullif(current_setting('app.business_id', true), '')::uuid
      OR "buyer_id" = nullif(current_setting('app.business_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "connection_requests_seller_insert" ON "connection_requests" FOR INSERT
  WITH CHECK ("seller_id" = nullif(current_setting('app.business_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "connection_requests_party_update" ON "connection_requests" FOR UPDATE
  USING ("seller_id" = nullif(current_setting('app.business_id', true), '')::uuid
      OR "buyer_id" = nullif(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK ("seller_id" = nullif(current_setting('app.business_id', true), '')::uuid
      OR "buyer_id" = nullif(current_setting('app.business_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "connection_requests_platform_select" ON "connection_requests" FOR SELECT
  USING (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "connection_requests" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "connection_requests" TO readonly;
--> statement-breakpoint
COMMENT ON TABLE "connections" IS 'rls:P';
--> statement-breakpoint
ALTER TABLE "connections" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "connections" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "connections" FROM PUBLIC;
--> statement-breakpoint
CREATE POLICY "connections_party_select" ON "connections" FOR SELECT
  USING ("seller_id" = nullif(current_setting('app.business_id', true), '')::uuid
      OR "buyer_id" = nullif(current_setting('app.business_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "connections_buyer_insert" ON "connections" FOR INSERT
  WITH CHECK ("buyer_id" = nullif(current_setting('app.business_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "connections_party_update" ON "connections" FOR UPDATE
  USING ("seller_id" = nullif(current_setting('app.business_id', true), '')::uuid
      OR "buyer_id" = nullif(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK ("seller_id" = nullif(current_setting('app.business_id', true), '')::uuid
      OR "buyer_id" = nullif(current_setting('app.business_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "connections_platform_select" ON "connections" FOR SELECT
  USING (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "connections" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "connections" TO readonly;
--> statement-breakpoint
COMMENT ON TABLE "blocks" IS 'rls:T';
--> statement-breakpoint
ALTER TABLE "blocks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "blocks" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "blocks" FROM PUBLIC;
--> statement-breakpoint
CREATE POLICY "blocks_tenant" ON "blocks" FOR ALL
  USING ("buyer_id" = nullif(current_setting('app.business_id', true), '')::uuid)
  WITH CHECK ("buyer_id" = nullif(current_setting('app.business_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "blocks_platform_select" ON "blocks" FOR SELECT
  USING (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
-- Yalnız connection_buyer_targets içinde etkilidir (app_user migrator rolünü üstlenemez).
CREATE POLICY "blocks_definer_select" ON "blocks" FOR SELECT TO migrator USING (true);
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON TABLE "blocks" TO app_user;
--> statement-breakpoint
GRANT SELECT ON TABLE "blocks" TO readonly;
--> statement-breakpoint
-- İstek hedefi (US-021, Mimar K2/K3): onaylı `buyer` yetenekli, işletmesi `active`, çağıran
-- olmayan perakendeciler. Dizinde görünme kapalı olsa da döner (tam eşleşmeyle bulunur, US-007 AC4).
-- Yalnız ünvan (dizinde her zaman açık), bölge/şehir (temsilci bölge kontrolü) ve çağıran
-- satıcıyı engelleyip engellemediği döner; başka bağlantı bilgisi yok. Çağıran: onaylı, aktif
-- satıcı bağlamı; en fazla 20 kimlik.
CREATE FUNCTION "connection_buyer_targets"(p_ids uuid[])
  RETURNS TABLE (id uuid, legal_name text, region_id uuid, city_id uuid, blocked boolean)
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_seller uuid := nullif(current_setting('app.business_id', true), '')::uuid;
BEGIN
  PERFORM public.directory_assert_caller('connection_buyer_targets', false, true);
  IF coalesce(cardinality(p_ids), 0) > 20 THEN
    RAISE EXCEPTION 'connection_buyer_targets: en fazla 20 kimlik' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT b.id,
         b.legal_name,
         b.region_id,
         CASE WHEN r.type = 'district' THEN r.parent_id ELSE r.id END,
         EXISTS (SELECT 1 FROM public.blocks bl WHERE bl.buyer_id = b.id AND bl.seller_id = v_seller)
    FROM public.businesses b
    JOIN public.business_capabilities c
      ON c.business_id = b.id AND c.capability = 'buyer' AND c.status = 'approved'
    JOIN public.regions r ON r.id = b.region_id
   WHERE b.id = ANY (p_ids)
     AND b.id <> v_seller
     AND b.status = 'active';
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "connection_buyer_targets"(uuid[]) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "connection_buyer_targets"(uuid[]) TO app_user;
--> statement-breakpoint
-- Yeni istek bildiriminin alıcıları (US-021 AC1, US-054): isteğin perakendecisinin aktif işletme
-- adminleri. Yalnız çağıran satıcının `pending` isteği için; yalnız kullanıcı kimliği döner.
CREATE FUNCTION "connection_request_recipients"(p_request_id uuid)
  RETURNS TABLE (user_id uuid)
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_seller uuid := nullif(current_setting('app.business_id', true), '')::uuid;
BEGIN
  PERFORM public.directory_assert_caller('connection_request_recipients', false, true);

  RETURN QUERY
  SELECT DISTINCT m.user_id
    FROM public.connection_requests cr
    JOIN public.memberships m ON m.business_id = cr.buyer_id AND m.status = 'active'
    JOIN public.roles ro ON ro.id = m.role_id AND ro.is_business_admin
   WHERE cr.id = p_request_id
     AND cr.seller_id = v_seller
     AND cr.status = 'pending'
   ORDER BY m.user_id;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "connection_request_recipients"(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "connection_request_recipients"(uuid) TO app_user;
