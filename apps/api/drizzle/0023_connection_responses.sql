CREATE UNIQUE INDEX "connections_request_uq" ON "connections" USING btree ("request_id");--> statement-breakpoint
-- ===== Elle eklenen bölüm (F2.13a: isteğe yanıt, geri çekme, engel; US-022, US-023, SF-03, R19) =====
-- 1) Durum bekçileri (state-machines §1–2). Servis geçişi `ConnectionRequestStateMachine` ile
--    denetler; tetikleyiciler doğrudan SQL'e karşı ikinci savunmadır (Müfettiş 16 F2.13 notu).
--    Taraf bağlamı `app.business_id`'dir; RLS UPDATE politikası zaten yalnız iki tarafa açık.
CREATE FUNCTION "connection_requests_guard"()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_ctx uuid := nullif(current_setting('app.business_id', true), '')::uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending' OR NEW.responded_at IS NOT NULL OR NEW.responded_by_user_id IS NOT NULL THEN
      RAISE EXCEPTION 'connection_requests: yeni istek pending olmalı' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = OLD.status THEN
    IF NEW.responded_at IS DISTINCT FROM OLD.responded_at
       OR NEW.responded_by_user_id IS DISTINCT FROM OLD.responded_by_user_id THEN
      RAISE EXCEPTION 'connection_requests: yanıt alanları yalnız geçişte yazılır' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'connection_requests: % → % geçişi yok', OLD.status, NEW.status USING ERRCODE = '23514';
  END IF;

  IF NEW.status IN ('accepted', 'rejected') THEN
    IF v_ctx IS DISTINCT FROM OLD.buyer_id THEN
      RAISE EXCEPTION 'connection_requests: yanıtı yalnız alıcı verir' USING ERRCODE = '42501';
    END IF;
    IF NEW.responded_at IS NULL OR NEW.responded_by_user_id IS NULL THEN
      RAISE EXCEPTION 'connection_requests: yanıt anı ve yanıtlayan zorunlu' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.status = 'withdrawn' THEN
    IF v_ctx IS DISTINCT FROM OLD.seller_id THEN
      RAISE EXCEPTION 'connection_requests: geri çekmeyi yalnız satıcı yapar' USING ERRCODE = '42501';
    END IF;
    IF NEW.responded_at IS NOT NULL OR NEW.responded_by_user_id IS NOT NULL THEN
      RAISE EXCEPTION 'connection_requests: geri çekmede yanıt alanı yok' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.status = 'expired' THEN
    -- Süre dolumu sistem işidir (F2.16): yalnız migrator sahipli fonksiyon içinden, bağlamsız
    -- (review-guide T4: izin verilen rol adıyla, kapalı varsayılan).
    IF current_user <> 'migrator' OR v_ctx IS NOT NULL THEN
      RAISE EXCEPTION 'connection_requests: süre dolumu yalnız sistem işi' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "connection_requests_guard"() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER "connection_requests_guard"
  BEFORE INSERT OR UPDATE ON "connection_requests"
  FOR EACH ROW EXECUTE FUNCTION "connection_requests_guard"();
--> statement-breakpoint
-- Bağlantı yalnız aynı çiftin `accepted` isteğinden, `active` olarak doğar (alıcı rastgele
-- `seller_id` ile bağlantı ekleyemez). İptal edilmiş bağlantı bir daha `active` olmaz (K6).
-- İstek satırı çağıran alıcıya P politikasıyla zaten görünür; tetikleyici DEFINER değildir.
CREATE FUNCTION "connections_guard"()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_ctx uuid := nullif(current_setting('app.business_id', true), '')::uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- BEFORE tetikleyicisi RLS WITH CHECK'ten önce çalışır: taraf denetimi burada da (42501).
    IF v_ctx IS DISTINCT FROM NEW.buyer_id THEN
      RAISE EXCEPTION 'connections: bağlantıyı yalnız alıcı ekler' USING ERRCODE = '42501';
    END IF;
    IF NEW.status <> 'active' THEN
      RAISE EXCEPTION 'connections: yeni bağlantı active olmalı' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
      SELECT 1
        FROM public.connection_requests r
       WHERE r.id = NEW.request_id
         AND r.seller_id = NEW.seller_id
         AND r.buyer_id = NEW.buyer_id
         AND r.status = 'accepted'
    ) THEN
      RAISE EXCEPTION 'connections: istek aynı çiftin kabul edilmiş isteği olmalı' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' THEN
    RAISE EXCEPTION 'connections: iptal edilmiş bağlantı yeniden açılamaz' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "connections_guard"() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER "connections_guard"
  BEFORE INSERT OR UPDATE ON "connections"
  FOR EACH ROW EXECUTE FUNCTION "connections_guard"();
--> statement-breakpoint
-- 2) Alıcı bağlamı denetimi (DEFINER fonksiyonlarının içinden çağrılır): işletme bağlamı var,
--    platform değil, onaylı `buyer` yetenekli ve aktif işletme. Aksi `42501`.
CREATE FUNCTION "connection_assert_buyer_caller"(p_fn text)
  RETURNS uuid
  LANGUAGE plpgsql
  STABLE
  SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_business uuid := nullif(current_setting('app.business_id', true), '')::uuid;
  v_platform boolean := coalesce(nullif(current_setting('app.is_platform', true), ''), 'false') = 'true';
BEGIN
  IF v_business IS NULL OR v_platform THEN
    RAISE EXCEPTION '%: perakendeci bağlamı gerekli', p_fn USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM public.business_capabilities c
      JOIN public.businesses b ON b.id = c.business_id
     WHERE c.business_id = v_business
       AND c.capability = 'buyer'
       AND c.status = 'approved'
       AND b.status = 'active'
  ) THEN
    RAISE EXCEPTION '%: onaylı perakendeci bağlamı gerekli', p_fn USING ERRCODE = '42501';
  END IF;
  RETURN v_business;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "connection_assert_buyer_caller"(text) FROM PUBLIC;
--> statement-breakpoint
-- 3) Satıcı profil özeti (US-023 AC1, R19 D okuma): yalnız çağıran perakendeciyle isteği,
--    bağlantısı veya engeli olan satıcılar (rastgele satıcı kimliğiyle tarama yok). Ünvan,
--    tanıtım metni ve `ready` logo nesnesi döner; ürün, fiyat, başka bağlantı bilgisi yok.
--    Satıcının gizlilik ayarı yoktur; logo her zaman açık (Mimar K4). En fazla 50 kimlik.
COMMENT ON TABLE "seller_profiles" IS 'rls:T,D';
--> statement-breakpoint
CREATE POLICY "seller_profiles_definer_select" ON "seller_profiles" FOR SELECT TO migrator USING (true);
--> statement-breakpoint
CREATE FUNCTION "connection_seller_summaries"(p_ids uuid[])
  RETURNS TABLE (id uuid, legal_name text, description jsonb, logo_bucket text, logo_object_key text)
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_buyer uuid;
BEGIN
  v_buyer := public.connection_assert_buyer_caller('connection_seller_summaries');
  IF coalesce(cardinality(p_ids), 0) > 50 THEN
    RAISE EXCEPTION 'connection_seller_summaries: en fazla 50 kimlik' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT b.id,
         b.legal_name,
         sp.description,
         f.bucket,
         f.object_key
    FROM public.businesses b
    JOIN public.business_capabilities c
      ON c.business_id = b.id AND c.capability = 'seller'
    LEFT JOIN public.seller_profiles sp ON sp.business_id = b.id
    LEFT JOIN public.files f
      ON f.id = b.logo_file_id
     AND f.owner_business_id = b.id
     AND f.purpose = 'logo'
     AND f.status = 'ready'
   WHERE b.id = ANY (p_ids)
     AND (
       EXISTS (SELECT 1 FROM public.connection_requests r
                WHERE r.seller_id = b.id AND r.buyer_id = v_buyer)
       OR EXISTS (SELECT 1 FROM public.connections k
                   WHERE k.seller_id = b.id AND k.buyer_id = v_buyer)
       OR EXISTS (SELECT 1 FROM public.blocks bl
                   WHERE bl.seller_id = b.id AND bl.buyer_id = v_buyer)
     );
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "connection_seller_summaries"(uuid[]) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "connection_seller_summaries"(uuid[]) TO app_user;
--> statement-breakpoint
-- 4) Kabul / red bildiriminin alıcıları (US-054 "İstek kabul / red"): isteği gönderen (hâlâ
--    satıcının aktif üyesiyse) + satıcının aktif işletme adminleri. Yalnız çağıran alıcının
--    yanıtladığı (`accepted` / `rejected`) isteği için; yalnız kullanıcı kimliği döner.
CREATE FUNCTION "connection_seller_recipients"(p_request_id uuid)
  RETURNS TABLE (user_id uuid)
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_buyer uuid;
BEGIN
  v_buyer := public.connection_assert_buyer_caller('connection_seller_recipients');

  RETURN QUERY
  SELECT DISTINCT m.user_id
    FROM public.connection_requests cr
    JOIN public.memberships m ON m.business_id = cr.seller_id AND m.status = 'active'
    JOIN public.roles ro ON ro.id = m.role_id
   WHERE cr.id = p_request_id
     AND cr.buyer_id = v_buyer
     AND cr.status IN ('accepted', 'rejected')
     AND (ro.is_business_admin OR m.user_id = cr.sent_by_user_id)
   ORDER BY m.user_id;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "connection_seller_recipients"(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "connection_seller_recipients"(uuid) TO app_user;
