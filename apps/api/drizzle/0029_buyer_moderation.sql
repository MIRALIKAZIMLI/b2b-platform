-- F2.18 platform admininin perakendeci yönetimi (US-015, US-016; state-machines §9, §2).
-- 1) `connections_ended_by_side_check` + `platform` (Drizzle şeması; yukarıdaki iki satır).
-- 2) `connections_guard`: 0026'nın kuralları AYNEN + platform kaynaklı kapatma (yalnız aşağıdaki
--    migrator sahipli fonksiyondan, arşivlenmiş alıcıda; kullanıcı kararı D2 = A).
-- 3) `memberships_last_admin_guard`: arşivlenmiş işletmede son admin denetimi yok (işletme kalıcı
--    silinirken üyelikler silinir; arşivli işletmeye zaten erişim yok, AccessGuard).
-- 4) `business_purge(p_business_id)`: geçmişsiz perakendeciyi kalıcı siler (US-016 AC3; D1 = A).
-- 5) `business_close_archived_connections(p_business_id, p_now)`: arşivlenen alıcının aktif
--    bağlantılarını kapatır (US-016 AC2, D2 = A).
-- İki fonksiyon migrator sahipli SECURITY DEFINER; çağıran denetimi içeride: platform bağlamı
-- (`app.is_platform = 'true'`, `app.user_id` dolu, `app.business_id` boş), aksi `42501`. Platform
-- politikaları (`TO public`) migrator için de geçerlidir; ek olarak yalnız migrator'a açık iki
-- politika grubu: `notifications_definer_select/_delete`, `connections_definer_platform_update`.
-- Mevcut satırlar değiştirilmez.
ALTER TABLE "connections" DROP CONSTRAINT "connections_ended_by_side_check";--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_ended_by_side_check" CHECK ("connections"."ended_by_side" is null or "connections"."ended_by_side" in ('seller', 'buyer', 'platform'));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "connections_guard"()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_ctx uuid := nullif(current_setting('app.business_id', true), '')::uuid;
  v_request public.connection_requests%ROWTYPE;
  v_platform boolean := coalesce(nullif(current_setting('app.is_platform', true), ''), 'false') = 'true';
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

  -- F2.15a: iptal alanları. F2.18: platform kaynaklı kapatma yalnız migrator sahipli
  -- `business_close_archived_connections` içinden (platform bağlamı, current_user = migrator),
  -- yalnız arşivlenmiş alıcının bağlantısında, `platform` + `business_archived` ile.
  IF OLD.status = 'active' AND NEW.status = 'cancelled' THEN
    IF NEW.ended_at IS NULL
       OR NEW.ended_by_side IS NULL
       OR NEW.end_reason IS NULL
       OR NEW.ended_by_user_id IS NULL THEN
      RAISE EXCEPTION 'connections: iptal alanları dolu olmalı' USING ERRCODE = '23514';
    END IF;
    IF v_ctx IS NULL AND v_platform AND current_user = 'migrator' THEN
      IF NEW.ended_by_side IS DISTINCT FROM 'platform'
         OR NEW.end_reason IS DISTINCT FROM 'business_archived'
         OR NOT EXISTS (SELECT 1 FROM public.businesses b
                         WHERE b.id = OLD.buyer_id AND b.status = 'archived') THEN
        RAISE EXCEPTION 'connections: platform yalnız arşivlenen alıcının bağlantısını kapatır' USING ERRCODE = '42501';
      END IF;
    ELSE
      IF v_ctx IS NULL
         OR (v_ctx IS DISTINCT FROM OLD.seller_id AND v_ctx IS DISTINCT FROM OLD.buyer_id) THEN
        RAISE EXCEPTION 'connections: bağlantıyı yalnız taraflardan biri iptal eder' USING ERRCODE = '42501';
      END IF;
      IF NEW.ended_by_side IS DISTINCT FROM
         (CASE WHEN v_ctx = OLD.seller_id THEN 'seller' ELSE 'buyer' END) THEN
        RAISE EXCEPTION 'connections: ended_by_side iptal eden taraf olmalı' USING ERRCODE = '42501';
      END IF;
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
CREATE OR REPLACE FUNCTION "memberships_last_admin_guard"() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  was_admin boolean;
BEGIN
  IF OLD.status <> 'active' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.status = OLD.status
     AND NEW.role_id = OLD.role_id
     AND NEW.business_id = OLD.business_id THEN
    RETURN NULL;
  END IF;
  -- F2.18: arşivlenmiş işletmede (kalıcı silme sırasında) son admin korunmaz.
  IF EXISTS (SELECT 1 FROM public.businesses b
              WHERE b.id = OLD.business_id AND b.status = 'archived') THEN
    RETURN NULL;
  END IF;
  SELECT r.is_business_admin INTO was_admin FROM public.roles r WHERE r.id = OLD.role_id;
  IF coalesce(was_admin, false) THEN
    PERFORM public.access_assert_business_has_admin(OLD.business_id);
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "memberships_last_admin_guard"() FROM PUBLIC;
--> statement-breakpoint
-- DELETE, silinecek satırları SELECT politikasıyla da görmeyi gerektirir.
CREATE POLICY "notifications_definer_select" ON "notifications" FOR SELECT TO migrator
  USING (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
CREATE POLICY "notifications_definer_delete" ON "notifications" FOR DELETE TO migrator
  USING (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
CREATE POLICY "connections_definer_platform_update" ON "connections" FOR UPDATE TO migrator
  USING (current_setting('app.is_platform', true) = 'true')
  WITH CHECK (current_setting('app.is_platform', true) = 'true');
--> statement-breakpoint
-- Geçmişsiz perakendeciyi kalıcı siler. "Geçmiş" (D1 = A): alıcının herhangi bir bağlantısı,
-- bağlantı isteği veya engel kaydı (sipariş, belge, cari tabloları F3–F5'te bu listeye eklenir).
-- İşletme satırı `FOR UPDATE` ile kilitlenir; geçmiş denetimi kilitten SONRA ayrı sorguyla yapılır
-- (READ COMMITTED: eşzamanlı commit edilen istek görülür; commit edilmemiş istek FK kilidiyle
-- (KEY SHARE) bu kilidi bekletir ya da silinen satıra FK hatası alır). Geçmiş varsa hiçbir şey
-- silinmez, `purged = false`. Silinen dosyaların nesne anahtarları döner (depo nesnesi commit
-- sonrası silinir). `audit_logs` ve `outbox_events` dokunulmaz (yalnız ekleme yapılan kayıtlar).
CREATE FUNCTION "business_purge"(p_business_id uuid)
  RETURNS TABLE (purged boolean, object_keys text[])
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_status text;
  v_keys text[];
BEGIN
  IF coalesce(nullif(current_setting('app.is_platform', true), ''), 'false') <> 'true'
     OR nullif(current_setting('app.user_id', true), '') IS NULL
     OR nullif(current_setting('app.business_id', true), '') IS NOT NULL THEN
    RAISE EXCEPTION 'business_purge: yalnız platform bağlamı' USING ERRCODE = '42501';
  END IF;
  IF p_business_id IS NULL THEN
    RAISE EXCEPTION 'business_purge: geçersiz parametre' USING ERRCODE = '22023';
  END IF;

  SELECT b.status INTO v_status FROM public.businesses b WHERE b.id = p_business_id FOR UPDATE;
  IF NOT FOUND OR v_status = 'archived' THEN
    RAISE EXCEPTION 'business_purge: işletme yok' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (SELECT 1 FROM public.business_capabilities c
              WHERE c.business_id = p_business_id AND c.capability <> 'buyer')
     OR NOT EXISTS (SELECT 1 FROM public.business_capabilities c
                     WHERE c.business_id = p_business_id AND c.capability = 'buyer') THEN
    RAISE EXCEPTION 'business_purge: yalnız perakendeci' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM public.connections x WHERE x.buyer_id = p_business_id)
     OR EXISTS (SELECT 1 FROM public.connection_requests x WHERE x.buyer_id = p_business_id)
     OR EXISTS (SELECT 1 FROM public.blocks x WHERE x.buyer_id = p_business_id) THEN
    RETURN QUERY SELECT false, NULL::text[];
    RETURN;
  END IF;

  -- Son admin bekçisi arşivli işletmeyi atlar; logo FK'sı dosyalardan önce çözülür.
  UPDATE public.businesses SET status = 'archived', logo_file_id = NULL WHERE id = p_business_id;
  UPDATE public.users SET last_business_id = NULL WHERE last_business_id = p_business_id;
  DELETE FROM public.notifications WHERE business_id = p_business_id;
  DELETE FROM public.invitations WHERE business_id = p_business_id;
  DELETE FROM public.memberships WHERE business_id = p_business_id;
  DELETE FROM public.roles WHERE business_id = p_business_id;
  DELETE FROM public.branches WHERE business_id = p_business_id;
  DELETE FROM public.warehouses WHERE business_id = p_business_id;
  DELETE FROM public.subscriptions WHERE business_id = p_business_id;
  DELETE FROM public.entitlement_overrides WHERE business_id = p_business_id;
  DELETE FROM public.buyer_profiles WHERE business_id = p_business_id;
  DELETE FROM public.business_privacy WHERE business_id = p_business_id;
  DELETE FROM public.person_data WHERE business_id = p_business_id;
  DELETE FROM public.business_capabilities WHERE business_id = p_business_id;
  WITH removed AS (
    DELETE FROM public.files WHERE owner_business_id = p_business_id RETURNING object_key
  )
  SELECT coalesce(array_agg(object_key ORDER BY object_key), ARRAY[]::text[]) INTO v_keys FROM removed;
  DELETE FROM public.businesses WHERE id = p_business_id;

  RETURN QUERY SELECT true, v_keys;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "business_purge"(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "business_purge"(uuid) TO app_user;
--> statement-breakpoint
-- Arşivlenen alıcının aktif bağlantıları kapanır: `ended_by_side = platform`,
-- `end_reason = business_archived`, kapatan = `app.user_id` (platform admini). İşletme aynı işlemde
-- önce `archived` yapılmış olmalı. Kapanan bağlantıların kimliği ve satıcısı döner (bildirim ve
-- `ConnectionCancelledHandler` kancaları çağıranda).
CREATE FUNCTION "business_close_archived_connections"(p_business_id uuid, p_now timestamptz)
  RETURNS TABLE (connection_id uuid, seller_id uuid)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_user uuid := nullif(current_setting('app.user_id', true), '')::uuid;
BEGIN
  IF coalesce(nullif(current_setting('app.is_platform', true), ''), 'false') <> 'true'
     OR v_user IS NULL
     OR nullif(current_setting('app.business_id', true), '') IS NOT NULL THEN
    RAISE EXCEPTION 'business_close_archived_connections: yalnız platform bağlamı' USING ERRCODE = '42501';
  END IF;
  IF p_business_id IS NULL OR p_now IS NULL THEN
    RAISE EXCEPTION 'business_close_archived_connections: geçersiz parametre' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.businesses b
                  WHERE b.id = p_business_id AND b.status = 'archived') THEN
    RAISE EXCEPTION 'business_close_archived_connections: işletme arşivli değil' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  UPDATE public.connections c
     SET status = 'cancelled',
         ended_at = p_now,
         ended_by_side = 'platform',
         end_reason = 'business_archived',
         ended_by_user_id = v_user,
         updated_at = p_now
   WHERE c.buyer_id = p_business_id
     AND c.status = 'active'
  RETURNING c.id, c.seller_id;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "business_close_archived_connections"(uuid, timestamptz) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "business_close_archived_connections"(uuid, timestamptz) TO app_user;
