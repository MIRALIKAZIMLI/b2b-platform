-- F2.14 takip (kullanıcı kararı 2026-11-10, temsilci B): bağlantıya yalnız satış temsilcisi
-- rolündeki (`seller_sales_rep` şablonundan kopyalanan veya bu şablondan türetilen özel rol) aktif
-- üye temsilci olarak atanabilir. Bekçi 0024'teki kuralların aynısı; yalnız temsilci denetimi daralır.
-- Mevcut satırlar değiştirilmez: denetim yalnız temsilci DEĞİŞİRKEN çalışır, var olan atama korunur.
-- `role_templates` G tablosu (herkes okur); `roles` T politikası satıcı bağlamında yalnız kendi rollerini gösterir.
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
                          JOIN public.roles r ON r.id = m.role_id AND r.business_id = m.business_id
                          JOIN public.role_templates t ON t.id = r.source_template_id
                        WHERE m.id = NEW.sales_rep_membership_id
                          AND m.business_id = OLD.seller_id
                          AND m.status = 'active'
                          AND t.code = 'seller_sales_rep') THEN
      RAISE EXCEPTION 'connections: temsilci satıcının satış temsilcisi rolündeki aktif üyesi olmalı' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "connections_guard"() FROM PUBLIC;
