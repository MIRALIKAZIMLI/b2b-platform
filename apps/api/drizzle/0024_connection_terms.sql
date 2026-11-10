ALTER TABLE "connections" ADD COLUMN "terms_set_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "terms_set_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_sales_rep_membership_id_memberships_id_fk" FOREIGN KEY ("sales_rep_membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_terms_set_check" CHECK (("connections"."terms_set_at" is null) = ("connections"."terms_set_by_user_id" is null));--> statement-breakpoint
-- F2.14a (US-024). Mevcut satırlar değiştirilmez: F2.13a döneminde (önerilen vade yazılarak) açılmış
-- bağlantıların vadesi olduğu gibi kalır, `terms_set_at` boş kalır ("koşul atanmadı").
-- users FK'sı burada (connections → identity bağımlılığı yok; F1.5a kalıbı).
ALTER TABLE "connections" ADD CONSTRAINT "connections_terms_set_by_user_id_users_id_fk"
  FOREIGN KEY ("terms_set_by_user_id") REFERENCES "public"."users"("id");
--> statement-breakpoint
-- Kolon düzeyi UPDATE izni (Müfettiş 16 M1) yalnız iki yeni kolona genişler; taraf kolonları aynı.
GRANT UPDATE ("terms_set_at", "terms_set_by_user_id") ON TABLE "connections" TO app_user;
--> statement-breakpoint
-- Bekçi yeniden (0023'teki kurallar aynen + F2.14a):
-- * INSERT: vade 0 (kullanıcı kararı 2026-11-10, F2.13a K1 = B; önerilen vade bağlantıya yazılmaz),
--   koşul alanları ve `terms_set_*` boş.
-- * UPDATE: koşul kolonlarından biri değişirse bağlam satırın satıcısı olmalı (Müfettiş 17 #60 L2;
--   alıcı, bağlamsız veya başka bağlam `42501`), eski ve yeni durum `active` olmalı, yeni temsilci
--   aynı satıcının aktif üyeliği olmalı (`23514`; `memberships` T politikası satıcı bağlamında
--   yalnız kendi üyeliklerini gösterir).
CREATE OR REPLACE FUNCTION "connections_guard"()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_ctx uuid := nullif(current_setting('app.business_id', true), '')::uuid;
  v_request public.connection_requests%ROWTYPE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- BEFORE tetikleyicisi RLS WITH CHECK'ten önce çalışır: taraf denetimi burada da (42501).
    IF v_ctx IS DISTINCT FROM NEW.buyer_id THEN
      RAISE EXCEPTION 'connections: bağlantıyı yalnız alıcı ekler' USING ERRCODE = '42501';
    END IF;
    IF NEW.status <> 'active' THEN
      RAISE EXCEPTION 'connections: yeni bağlantı active olmalı' USING ERRCODE = '23514';
    END IF;
    SELECT r.* INTO v_request
      FROM public.connection_requests r
     WHERE r.id = NEW.request_id
       AND r.seller_id = NEW.seller_id
       AND r.buyer_id = NEW.buyer_id
       AND r.status = 'accepted';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'connections: istek aynı çiftin kabul edilmiş isteği olmalı' USING ERRCODE = '23514';
    END IF;
    IF NEW.started_at IS DISTINCT FROM v_request.responded_at
       OR NEW.price_list_id IS NOT NULL
       OR NEW.credit_limit IS NOT NULL
       OR NEW.sales_rep_membership_id IS NOT NULL
       OR NEW.branch_pricing_enabled
       OR NEW.payment_term_days <> 0
       OR NEW.terms_set_at IS NOT NULL
       OR NEW.terms_set_by_user_id IS NOT NULL
       OR NEW.ended_at IS NOT NULL
       OR NEW.ended_by_side IS NOT NULL
       OR NEW.end_reason IS NOT NULL
       OR NEW.ended_by_user_id IS NOT NULL THEN
      RAISE EXCEPTION 'connections: yeni bağlantı varsayılan koşullarla, kabul anında başlar' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' THEN
    RAISE EXCEPTION 'connections: iptal edilmiş bağlantı yeniden açılamaz' USING ERRCODE = '23514';
  END IF;

  IF NEW.price_list_id IS DISTINCT FROM OLD.price_list_id
     OR NEW.branch_pricing_enabled IS DISTINCT FROM OLD.branch_pricing_enabled
     OR NEW.credit_limit IS DISTINCT FROM OLD.credit_limit
     OR NEW.payment_term_days IS DISTINCT FROM OLD.payment_term_days
     OR NEW.sales_rep_membership_id IS DISTINCT FROM OLD.sales_rep_membership_id
     OR NEW.terms_set_at IS DISTINCT FROM OLD.terms_set_at
     OR NEW.terms_set_by_user_id IS DISTINCT FROM OLD.terms_set_by_user_id THEN
    IF v_ctx IS NULL OR v_ctx IS DISTINCT FROM OLD.seller_id THEN
      RAISE EXCEPTION 'connections: koşulları yalnız satıcı değiştirir' USING ERRCODE = '42501';
    END IF;
    IF OLD.status <> 'active' OR NEW.status <> 'active' THEN
      RAISE EXCEPTION 'connections: koşullar yalnız aktif bağlantıda değişir' USING ERRCODE = '23514';
    END IF;
    IF NEW.sales_rep_membership_id IS NOT NULL
       AND NEW.sales_rep_membership_id IS DISTINCT FROM OLD.sales_rep_membership_id
       AND NOT EXISTS (SELECT 1 FROM public.memberships m
                        WHERE m.id = NEW.sales_rep_membership_id
                          AND m.business_id = OLD.seller_id
                          AND m.status = 'active') THEN
      RAISE EXCEPTION 'connections: temsilci satıcının aktif üyesi olmalı' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "connections_guard"() FROM PUBLIC;
