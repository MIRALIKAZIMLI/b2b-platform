-- F2.17 bağlantısız hesap politikası (US-027; state-machines §9; data-model `buyer_profiles`).
-- Üretilen satır: `buyer_profiles.dormant_since` (sayaç başlangıcı). Elle eklenen bölüm aşağıda.
-- 1) Mevcut satırlarda sayaç = işletmenin kayıt anı (platform bağlamında, yalnız bu migration'da).
-- 2) Bekçi `buyer_profiles_guard_dormant_columns`: aşama/sayaç kolonlarını kiracı yazamaz.
-- 3) `businesses_guard_platform_columns`: 0016 kuralları AYNEN + migrator yolu (platform bağlamı
--    yok) yalnız `active → dormant`, `dormant → active`, `dormant → archived`.
-- 4) Yalnız migrator'a açık politikalar (yalnız aşağıdaki SECURITY DEFINER fonksiyonlarda etkili).
-- 5) Fonksiyonlar: `dormant_scan`, `dormant_advance`, `dormant_archive`, `dormant_recipients`
--    (yalnız bağlamsız sistem işi) ve `buyer_dormant_touch` (yalnız kullanıcı bağlamı).
-- Uygunluk (US-027 AC5): alıcının hiçbir `connections` satırı yok (iptal dahil); sipariş/cari
-- tabloları F3–F5'te bu koşula eklenir. Fonksiyonlar uygunluğu kilitli satırda yeniden denetler.
ALTER TABLE "buyer_profiles" ADD COLUMN "dormant_since" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
SELECT set_config('app.is_platform', 'true', true);
--> statement-breakpoint
UPDATE "buyer_profiles" bp SET "dormant_since" = b."created_at"
  FROM "businesses" b WHERE b."id" = bp."business_id";
--> statement-breakpoint
SELECT set_config('app.is_platform', '', true);
--> statement-breakpoint
CREATE FUNCTION "buyer_profiles_guard_dormant_columns"() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF current_setting('app.is_platform', true) = 'true' OR current_user = 'migrator' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.dormant_stage <> 'none' OR NEW.dormant_stage_at IS NOT NULL THEN
      RAISE EXCEPTION 'buyer_profiles: bağlantısız hesap aşaması yalnız sistemce yazılır' USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.dormant_stage IS DISTINCT FROM OLD.dormant_stage
     OR NEW.dormant_stage_at IS DISTINCT FROM OLD.dormant_stage_at
     OR NEW.dormant_since IS DISTINCT FROM OLD.dormant_since THEN
    RAISE EXCEPTION 'buyer_profiles: bağlantısız hesap aşaması yalnız sistemce yazılır' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "buyer_profiles_guard_dormant_columns"() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER "buyer_profiles_guard_dormant_columns" BEFORE INSERT OR UPDATE ON "buyer_profiles"
  FOR EACH ROW EXECUTE FUNCTION "buyer_profiles_guard_dormant_columns"();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "businesses_guard_platform_columns"() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF current_setting('app.is_platform', true) IS DISTINCT FROM 'true' THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.status <> 'active'
         OR NEW.created_via <> 'self_signup'
         OR NEW.verified_at IS NOT NULL
         OR NEW.verified_by IS NOT NULL THEN
        RAISE EXCEPTION 'businesses: bu alanlar yalnızca platform bağlamında ayarlanabilir'
          USING ERRCODE = '42501';
      END IF;
    ELSIF current_user = 'migrator'
       AND nullif(current_setting('app.business_id', true), '') IS NULL
       AND NEW.verified_at IS NOT DISTINCT FROM OLD.verified_at
       AND NEW.verified_by IS NOT DISTINCT FROM OLD.verified_by
       AND NEW.created_via IS NOT DISTINCT FROM OLD.created_via
       AND (NEW.status IS NOT DISTINCT FROM OLD.status
            OR (OLD.status = 'active' AND NEW.status = 'dormant')
            OR (OLD.status = 'dormant' AND NEW.status IN ('active', 'archived'))) THEN
      -- F2.17: bağlantısız hesap geçişleri (state-machines §9), yalnız 0030 fonksiyonlarından.
      NULL;
    ELSIF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
       OR NEW.verified_by IS DISTINCT FROM OLD.verified_by
       OR NEW.created_via IS DISTINCT FROM OLD.created_via THEN
      RAISE EXCEPTION 'businesses: bu alanlar yalnızca platform bağlamında değiştirilebilir'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.voen IS NULL THEN
    NEW.legal_type := NULL;
  ELSIF right(NEW.voen, 1) = '1' THEN
    NEW.legal_type := 'legal_entity';
  ELSE
    NEW.legal_type := 'individual_entrepreneur';
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.voen IS DISTINCT FROM OLD.voen
     AND NEW.verified_at IS NOT DISTINCT FROM OLD.verified_at
     AND NEW.verified_by IS NOT DISTINCT FROM OLD.verified_by THEN
    NEW.verified_at := NULL;
    NEW.verified_by := NULL;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "businesses_guard_platform_columns"() FROM PUBLIC;
--> statement-breakpoint
CREATE POLICY "connections_definer_select" ON "connections" FOR SELECT TO migrator USING (true);
--> statement-breakpoint
CREATE POLICY "service_areas_definer_select" ON "service_areas" FOR SELECT TO migrator USING (true);
--> statement-breakpoint
CREATE POLICY "buyer_profiles_definer_update" ON "buyer_profiles" FOR UPDATE TO migrator
  USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "businesses_definer_dormant_update" ON "businesses" FOR UPDATE TO migrator
  USING ("status" IN ('active', 'dormant'))
  WITH CHECK ("status" IN ('active', 'dormant', 'archived'));
--> statement-breakpoint
CREATE POLICY "person_data_definer_delete" ON "person_data" FOR DELETE TO migrator USING (true);
--> statement-breakpoint
-- Ortak çağıran denetimi: yalnız bağlamsız sistem işi (`withSystemTx`). SECURITY DEFINER değil,
-- PUBLIC EXECUTE yok; yalnız aşağıdaki migrator sahipli fonksiyonlar çağırır.
CREATE FUNCTION "dormant_assert_system"(p_fn text) RETURNS void
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF nullif(current_setting('app.business_id', true), '') IS NOT NULL
     OR nullif(current_setting('app.user_id', true), '') IS NOT NULL
     OR coalesce(nullif(current_setting('app.is_platform', true), ''), 'false') = 'true' THEN
    RAISE EXCEPTION '%: yalnız bağlamsız sistem işi', p_fn USING ERRCODE = '42501';
  END IF;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "dormant_assert_system"(text) FROM PUBLIC;
--> statement-breakpoint
-- Politikaya giren perakendeci mi (kilit çağıranda): `active`/`dormant`, onaylı `buyer`, alıcı
-- olduğu hiçbir bağlantı satırı yok (US-027 AC5; sipariş/cari F3–F5).
CREATE FUNCTION "dormant_eligible"(p_business_id uuid) RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.businesses b
      JOIN public.business_capabilities c
        ON c.business_id = b.id AND c.capability = 'buyer' AND c.status = 'approved'
     WHERE b.id = p_business_id
       AND b.status IN ('active', 'dormant')
       AND NOT EXISTS (SELECT 1 FROM public.connections x WHERE x.buyer_id = b.id)
  );
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "dormant_eligible"(uuid) FROM PUBLIC;
--> statement-breakpoint
-- Gece işinin taraması: kimliği `p_after`'dan büyük, sayacı en az `p_min_days` gün olan uygun
-- perakendeciler, kimlik sırasıyla en çok `p_limit` satır. Satırlar `FOR UPDATE SKIP LOCKED`
-- (çağıranın işleminde kilitli kalır; başka kopyanın aldığı satır atlanır).
CREATE FUNCTION "dormant_scan"(p_now timestamptz, p_after uuid, p_min_days integer, p_limit integer)
  RETURNS TABLE (business_id uuid, status text, stage text, stage_at timestamptz, since timestamptz)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  PERFORM public.dormant_assert_system('dormant_scan');
  IF p_now IS NULL OR p_min_days IS NULL OR p_min_days < 0
     OR p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'dormant_scan: geçersiz parametre' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT bp.business_id, b.status, bp.dormant_stage, bp.dormant_stage_at, bp.dormant_since
    FROM public.buyer_profiles bp
    JOIN public.businesses b ON b.id = bp.business_id
   WHERE (p_after IS NULL OR bp.business_id > p_after)
     AND bp.dormant_since <= p_now - make_interval(days => p_min_days)
     AND b.status IN ('active', 'dormant')
     AND EXISTS (SELECT 1 FROM public.business_capabilities c
                  WHERE c.business_id = b.id AND c.capability = 'buyer' AND c.status = 'approved')
     AND NOT EXISTS (SELECT 1 FROM public.connections x WHERE x.buyer_id = b.id)
   ORDER BY bp.business_id
   LIMIT p_limit
     FOR UPDATE OF bp SKIP LOCKED;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "dormant_scan"(timestamptz, uuid, integer, integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "dormant_scan"(timestamptz, uuid, integer, integer) TO app_user;
--> statement-breakpoint
-- Aşamayı bir adım ilerletir. Eşikler çağıranda (saf kural `dormant-policy.ts`); burada kilitli
-- satırda uygunluk ve aşama sırası yeniden denetlenir: hatırlatma yalnız ileri, `warned` uyarı
-- öncesi aşamalardan, `deactivated` yalnız `warned`'dan (işletme `active → dormant`). Uygun değilse
-- (bu arada giriş yapıldı, bağlantı kuruldu) hiçbir şey yazılmaz, `false`.
CREATE FUNCTION "dormant_advance"(p_business_id uuid, p_stage text, p_now timestamptz)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_stage text;
  v_status text;
BEGIN
  PERFORM public.dormant_assert_system('dormant_advance');
  IF p_business_id IS NULL OR p_now IS NULL
     OR p_stage IS NULL OR p_stage NOT IN ('reminded_7', 'reminded_30', 'warned', 'deactivated') THEN
    RAISE EXCEPTION 'dormant_advance: geçersiz parametre' USING ERRCODE = '22023';
  END IF;

  SELECT bp.dormant_stage INTO v_stage
    FROM public.buyer_profiles bp WHERE bp.business_id = p_business_id FOR UPDATE;
  IF NOT FOUND OR NOT public.dormant_eligible(p_business_id) THEN
    RETURN false;
  END IF;
  SELECT b.status INTO v_status FROM public.businesses b WHERE b.id = p_business_id FOR UPDATE;

  IF NOT (
       (p_stage = 'reminded_7' AND v_stage = 'none')
    OR (p_stage = 'reminded_30' AND v_stage IN ('none', 'reminded_7'))
    OR (p_stage = 'warned' AND v_stage IN ('none', 'reminded_7', 'reminded_30'))
    OR (p_stage = 'deactivated' AND v_stage = 'warned' AND v_status = 'active')
  ) THEN
    RETURN false;
  END IF;

  UPDATE public.buyer_profiles
     SET dormant_stage = p_stage, dormant_stage_at = p_now, updated_at = p_now
   WHERE business_id = p_business_id;
  IF p_stage = 'deactivated' THEN
    UPDATE public.businesses SET status = 'dormant', updated_at = p_now WHERE id = p_business_id;
  END IF;
  RETURN true;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "dormant_advance"(uuid, text, timestamptz) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "dormant_advance"(uuid, text, timestamptz) TO app_user;
--> statement-breakpoint
-- "Geçmiş" (F2.18 D1 = A; F2.17 S1 = B): alıcının herhangi bir bağlantısı, bağlantı isteği veya
-- engel kaydı (sipariş, belge, cari tabloları F3–F5'te bu listeye eklenir). Tek yer.
CREATE FUNCTION "business_has_history"(p_business_id uuid) RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.connections x WHERE x.buyer_id = p_business_id)
      OR EXISTS (SELECT 1 FROM public.connection_requests x WHERE x.buyer_id = p_business_id)
      OR EXISTS (SELECT 1 FROM public.blocks x WHERE x.buyer_id = p_business_id);
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "business_has_history"(uuid) FROM PUBLIC;
--> statement-breakpoint
-- Kalıcı silmenin satır silme bölümü (0029 `business_purge` gövdesinden AYNEN taşındı; F2.17 aynı
-- listeyi kullansın diye tek yer). SECURITY DEFINER değil, PUBLIC EXECUTE yok: yalnız migrator
-- sahipli DEFINER fonksiyonlar platform bağlamında, işletme satırı kilitliyken ve geçmiş denetimi
-- yapılmışken çağırır. Silinen dosyaların nesne anahtarları döner.
CREATE FUNCTION "business_purge_rows"(p_business_id uuid)
  RETURNS text[]
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_keys text[];
BEGIN
  IF current_setting('app.is_platform', true) IS DISTINCT FROM 'true' OR current_user <> 'migrator' THEN
    RAISE EXCEPTION 'business_purge_rows: yalnız platform bağlamındaki DEFINER fonksiyonu' USING ERRCODE = '42501';
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
  RETURN v_keys;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "business_purge_rows"(uuid) FROM PUBLIC;
--> statement-breakpoint
-- 0029 ile aynı davranış; silme bölümü artık `business_purge_rows`'ta.
CREATE OR REPLACE FUNCTION "business_purge"(p_business_id uuid)
  RETURNS TABLE (purged boolean, object_keys text[])
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_status text;
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

  IF public.business_has_history(p_business_id) THEN
    RETURN QUERY SELECT false, NULL::text[];
    RETURN;
  END IF;

  RETURN QUERY SELECT true, public.business_purge_rows(p_business_id);
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "business_purge"(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "business_purge"(uuid) TO app_user;
--> statement-breakpoint
-- 180. gün (US-027 AC4; kullanıcı kararı S1 = B, admin "sil" ile aynı kural): yalnız aşama
-- `deactivated` ve işletme `dormant` iken. Geçmiş (bağlantı isteği, engel) yoksa kayıt kalıcı silinir
-- (`business_purge_rows`; satır silme platform politikalarıyla, bu yüzden fonksiyon içinde platform
-- bağlamı geçici açılır ve hemen kapanır); varsa işletme `archived` olur, 🔒 `person_data` silinir,
-- açık davetler kapanır, istek ve engel kayıtları kalır. Kullanıcı hesapları (`users`) silinmez.
-- Sonuç: `purged` (+ silinen dosya nesne anahtarları), `archived` veya uygun değilse `skipped`.
CREATE FUNCTION "dormant_archive"(p_business_id uuid, p_now timestamptz)
  RETURNS TABLE (outcome text, person_rows integer, invitations_closed integer, object_keys text[])
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_stage text;
  v_status text;
  v_person integer;
  v_invitations integer;
  v_keys text[];
BEGIN
  PERFORM public.dormant_assert_system('dormant_archive');
  IF p_business_id IS NULL OR p_now IS NULL THEN
    RAISE EXCEPTION 'dormant_archive: geçersiz parametre' USING ERRCODE = '22023';
  END IF;

  SELECT bp.dormant_stage INTO v_stage
    FROM public.buyer_profiles bp WHERE bp.business_id = p_business_id FOR UPDATE;
  IF NOT FOUND OR NOT public.dormant_eligible(p_business_id) THEN
    RETURN QUERY SELECT 'skipped'::text, 0, 0, ARRAY[]::text[];
    RETURN;
  END IF;
  SELECT b.status INTO v_status FROM public.businesses b WHERE b.id = p_business_id FOR UPDATE;
  IF v_stage <> 'deactivated' OR v_status <> 'dormant' THEN
    RETURN QUERY SELECT 'skipped'::text, 0, 0, ARRAY[]::text[];
    RETURN;
  END IF;

  IF NOT public.business_has_history(p_business_id) THEN
    SELECT count(*)::integer INTO v_person FROM public.person_data WHERE business_id = p_business_id;
    PERFORM set_config('app.is_platform', 'true', true);
    v_keys := public.business_purge_rows(p_business_id);
    PERFORM set_config('app.is_platform', '', true);
    RETURN QUERY SELECT 'purged'::text, v_person, 0, v_keys;
    RETURN;
  END IF;

  UPDATE public.businesses SET status = 'archived', updated_at = p_now WHERE id = p_business_id;
  DELETE FROM public.person_data WHERE business_id = p_business_id;
  GET DIAGNOSTICS v_person = ROW_COUNT;
  UPDATE public.invitations
     SET expires_at = p_now
   WHERE business_id = p_business_id AND accepted_at IS NULL AND expires_at > p_now;
  GET DIAGNOSTICS v_invitations = ROW_COUNT;
  RETURN QUERY SELECT 'archived'::text, v_person, v_invitations, ARRAY[]::text[];
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "dormant_archive"(uuid, timestamptz) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "dormant_archive"(uuid, timestamptz) TO app_user;
--> statement-breakpoint
-- Bildirim alıcıları (kart V1): `buyer_admins` = perakendecinin aktif adminleri; `region_sellers`
-- = hizmet bölgesi perakendecinin bölgesini kapsayan, `active` ve `seller` yeteneği onaylı
-- toptancıların aktif adminleri (`business_id` = toptancı). Perakendeci dizinde gizliyse veya
-- toptancıyı engellediyse o toptancı yok.
CREATE FUNCTION "dormant_recipients"(p_business_id uuid, p_kind text)
  RETURNS TABLE (user_id uuid, business_id uuid)
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  PERFORM public.dormant_assert_system('dormant_recipients');
  IF p_business_id IS NULL OR p_kind IS NULL OR p_kind NOT IN ('buyer_admins', 'region_sellers') THEN
    RAISE EXCEPTION 'dormant_recipients: geçersiz parametre' USING ERRCODE = '22023';
  END IF;

  IF p_kind = 'buyer_admins' THEN
    RETURN QUERY
    SELECT DISTINCT m.user_id, m.business_id
      FROM public.memberships m
      JOIN public.roles ro ON ro.id = m.role_id AND ro.is_business_admin
     WHERE m.business_id = p_business_id AND m.status = 'active'
     ORDER BY m.user_id;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT m.user_id, s.id
    FROM public.businesses buyer
    JOIN public.buyer_profiles bp ON bp.business_id = buyer.id AND bp.listed_in_directory
    JOIN public.service_areas sa ON sa.region_id = buyer.region_id
    JOIN public.businesses s ON s.id = sa.seller_id AND s.status = 'active'
    JOIN public.business_capabilities c
      ON c.business_id = s.id AND c.capability = 'seller' AND c.status = 'approved'
    JOIN public.memberships m ON m.business_id = s.id AND m.status = 'active'
    JOIN public.roles ro ON ro.id = m.role_id AND ro.is_business_admin
   WHERE buyer.id = p_business_id
     AND NOT EXISTS (SELECT 1 FROM public.blocks bl
                      WHERE bl.buyer_id = buyer.id AND bl.seller_id = s.id)
   ORDER BY s.id, m.user_id;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "dormant_recipients"(uuid, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "dormant_recipients"(uuid, text) TO app_user;
--> statement-breakpoint
-- Giriş / oturum yenileme (US-027 AC3; state-machines §9 "girişte none'a döner"): yalnız kullanıcı
-- bağlamı (`withUserTx`). Kullanıcının aktif üyesi olduğu perakendecilerde aşama `none`, sayaç
-- `p_now`; `dormant` işletme `active` olur. Yazma yalnız aşama `none` değilse, işletme `dormant`
-- ise veya sayaç `p_min_interval_minutes`'tan eskiyse (sıcak yol: çoğu çağrı yalnız okur).
-- Arşivlenmiş veya askıdaki işletmeye dokunmaz.
CREATE FUNCTION "buyer_dormant_touch"(p_now timestamptz, p_min_interval_minutes integer)
  RETURNS TABLE (business_id uuid, reactivated boolean)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_user uuid := nullif(current_setting('app.user_id', true), '')::uuid;
  r record;
BEGIN
  IF v_user IS NULL
     OR nullif(current_setting('app.business_id', true), '') IS NOT NULL
     OR coalesce(nullif(current_setting('app.is_platform', true), ''), 'false') = 'true' THEN
    RAISE EXCEPTION 'buyer_dormant_touch: yalnız kullanıcı bağlamı' USING ERRCODE = '42501';
  END IF;
  IF p_now IS NULL OR p_min_interval_minutes IS NULL OR p_min_interval_minutes < 1 THEN
    RAISE EXCEPTION 'buyer_dormant_touch: geçersiz parametre' USING ERRCODE = '22023';
  END IF;

  FOR r IN
    SELECT bp.business_id AS id, b.status AS status
      FROM public.memberships m
      JOIN public.businesses b ON b.id = m.business_id AND b.status IN ('active', 'dormant')
      JOIN public.buyer_profiles bp ON bp.business_id = b.id
     WHERE m.user_id = v_user
       AND m.status = 'active'
       AND (bp.dormant_stage <> 'none'
            OR b.status = 'dormant'
            OR bp.dormant_since < p_now - make_interval(mins => p_min_interval_minutes))
     ORDER BY bp.business_id
       FOR UPDATE OF bp, b
  LOOP
    UPDATE public.buyer_profiles
       SET dormant_stage = 'none', dormant_stage_at = NULL, dormant_since = p_now, updated_at = p_now
     WHERE business_id = r.id;
    IF r.status = 'dormant' THEN
      UPDATE public.businesses SET status = 'active', updated_at = p_now WHERE id = r.id;
    END IF;
    business_id := r.id;
    reactivated := r.status = 'dormant';
    RETURN NEXT;
  END LOOP;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "buyer_dormant_touch"(timestamptz, integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "buyer_dormant_touch"(timestamptz, integer) TO app_user;
