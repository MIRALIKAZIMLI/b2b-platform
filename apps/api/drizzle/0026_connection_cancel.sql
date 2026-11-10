-- F2.15a bağlantı iptali (US-025, SF-07, state-machines §2). İki parça:
-- 1) `connections_guard`: 0025'in kuralları AYNEN + iptal kuralları. İptal alanları yalnız iptal
--    eden tarafın bağlamında yazılır (`ended_by_side` = bağlamın tarafı), dört alan birlikte dolu;
--    iptal sonrası değişmez. Platform kaynaklı kapatma (F2.17/F2.18) bugün reddedilir; o adımlar
--    bekçiyi genişletir (Mimar notu 4).
-- 2) `connection_counterpart_admins`: iptal bildiriminin alıcıları (US-054 "Bağlantı iptal edildi":
--    karşı tarafın adminleri). Karşı tarafın `memberships` satırları RLS ile görünmez → DEFINER.
-- Mevcut satırlar değiştirilmez.
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

  -- F2.15a: iptal alanları.
  IF OLD.status = 'active' AND NEW.status = 'cancelled' THEN
    IF v_ctx IS NULL
       OR (v_ctx IS DISTINCT FROM OLD.seller_id AND v_ctx IS DISTINCT FROM OLD.buyer_id) THEN
      RAISE EXCEPTION 'connections: bağlantıyı yalnız taraflardan biri iptal eder' USING ERRCODE = '42501';
    END IF;
    IF NEW.ended_at IS NULL
       OR NEW.ended_by_side IS NULL
       OR NEW.end_reason IS NULL
       OR NEW.ended_by_user_id IS NULL THEN
      RAISE EXCEPTION 'connections: iptal alanları dolu olmalı' USING ERRCODE = '23514';
    END IF;
    IF NEW.ended_by_side IS DISTINCT FROM
       (CASE WHEN v_ctx = OLD.seller_id THEN 'seller' ELSE 'buyer' END) THEN
      RAISE EXCEPTION 'connections: ended_by_side iptal eden taraf olmalı' USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.ended_at IS DISTINCT FROM OLD.ended_at
     OR NEW.ended_by_side IS DISTINCT FROM OLD.ended_by_side
     OR NEW.end_reason IS DISTINCT FROM OLD.end_reason
     OR NEW.ended_by_user_id IS DISTINCT FROM OLD.ended_by_user_id THEN
    RAISE EXCEPTION 'connections: iptal alanları yalnız iptal anında yazılır' USING ERRCODE = '23514';
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
--> statement-breakpoint
-- İptal bildiriminin alıcıları: çağıran bağlam iptal edilmiş bağlantının tarafı (o taraf
-- yeteneği onaylı, işletme aktif) olmalı; karşı tarafın aktif işletme adminlerinin yalnız
-- kullanıcı kimliği döner (başka alan yok). Platform bağlamı ve bağlamsız çağrı `42501`.
CREATE FUNCTION "connection_counterpart_admins"(p_connection_id uuid)
  RETURNS TABLE (user_id uuid)
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_business uuid := nullif(current_setting('app.business_id', true), '')::uuid;
  v_platform boolean := coalesce(nullif(current_setting('app.is_platform', true), ''), 'false') = 'true';
  v_counterpart uuid;
  v_side text;
BEGIN
  IF v_business IS NULL OR v_platform THEN
    RAISE EXCEPTION 'connection_counterpart_admins: işletme bağlamı gerekli' USING ERRCODE = '42501';
  END IF;

  SELECT CASE WHEN c.seller_id = v_business THEN c.buyer_id ELSE c.seller_id END,
         CASE WHEN c.seller_id = v_business THEN 'seller' ELSE 'buyer' END
    INTO v_counterpart, v_side
    FROM public.connections c
   WHERE c.id = p_connection_id
     AND c.status = 'cancelled'
     AND (c.seller_id = v_business OR c.buyer_id = v_business);
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.business_capabilities cap
      JOIN public.businesses b ON b.id = cap.business_id
     WHERE cap.business_id = v_business
       AND cap.capability = v_side
       AND cap.status = 'approved'
       AND b.status = 'active'
  ) THEN
    RAISE EXCEPTION 'connection_counterpart_admins: onaylı taraf bağlamı gerekli' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT DISTINCT m.user_id
    FROM public.memberships m
    JOIN public.roles ro ON ro.id = m.role_id
   WHERE m.business_id = v_counterpart
     AND m.status = 'active'
     AND ro.is_business_admin
   ORDER BY m.user_id;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "connection_counterpart_admins"(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "connection_counterpart_admins"(uuid) TO app_user;
