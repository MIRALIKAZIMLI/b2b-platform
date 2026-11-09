-- ===== F2.11a (US-019, US-020, US-007 AC1–AC6, ADR-0011, ADR-0014, TM-09, TM-10) =====
-- Perakendeci dizininin D (dizin) okuması. Başka kiracının satırları yalnız aşağıdaki migrator
-- sahipli SECURITY DEFINER fonksiyonlarla okunur; görünürlük ayarı fonksiyonun içinde uygulanır.
-- Kapalı alan her zaman null döner; bağlantı, alım hacmi, kişisel telefon ve e-posta hiç dönmez
-- (US-007 AC6, TM-10). Kişisel telefon yalnız tam eşleşme koşulunda kullanılır, dönmez.
-- Yeni tablo yok. `person_data` artık D fonksiyonunca okunur: sınıfı `rls:T,D` olur.
--
-- Çağıran (bağlam) kuralı:
--   * directory_buyer_documents: onaylı ve aktif `seller` işletme bağlamı, platform bağlamı veya
--     bağlamsız sistem işlemi (worker, `withSystemTx`). `buyer` işletme bağlamı 42501.
--   * directory_buyer_page: yalnız platform veya bağlamsız sistem işlemi (yeniden indeksleme).
--   * directory_buyer_exact_match: yalnız onaylı ve aktif `seller` işletme bağlamı.
--
CREATE INDEX "businesses_business_phone_digits_idx" ON "businesses" USING btree (regexp_replace("business_phone", '[^0-9]', '', 'g')) WHERE "businesses"."business_phone" is not null;--> statement-breakpoint
CREATE INDEX "person_data_personal_phone_idx" ON "person_data" USING btree ("personal_phone") WHERE "person_data"."personal_phone" is not null;
COMMENT ON TABLE "person_data" IS 'rls:T,D';
--> statement-breakpoint
-- TO migrator politikaları yalnız SECURITY DEFINER fonksiyonların içinde etkilidir (app_user bu
-- rolü üstlenemez). `businesses` ve `users` için okuma politikası 0013 / 0008'de var.
CREATE POLICY "buyer_profiles_definer_select" ON "buyer_profiles" FOR SELECT TO migrator USING (true);
--> statement-breakpoint
CREATE POLICY "business_privacy_definer_select" ON "business_privacy" FOR SELECT TO migrator USING (true);
--> statement-breakpoint
CREATE POLICY "person_data_definer_select" ON "person_data" FOR SELECT TO migrator USING (true);
--> statement-breakpoint
CREATE POLICY "business_capabilities_definer_select" ON "business_capabilities" FOR SELECT TO migrator USING (true);
--> statement-breakpoint
CREATE POLICY "memberships_definer_select" ON "memberships" FOR SELECT TO migrator USING (true);
--> statement-breakpoint
CREATE POLICY "roles_definer_select" ON "roles" FOR SELECT TO migrator USING (true);
--> statement-breakpoint
-- Çağıran bağlamı kontrolü. p_allow_system: bağlamsız sistem / platform işlemine izin.
-- Onaylı ve aktif seller değilse 42501. SECURITY DEFINER değil; yalnız aşağıdaki fonksiyonlar
-- (migrator olarak) çağırır, PUBLIC ve app_user çalıştıramaz.
CREATE FUNCTION "directory_assert_caller"(p_fn text, p_allow_system boolean, p_allow_seller boolean)
  RETURNS void
  LANGUAGE plpgsql
  STABLE
  SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_business uuid := nullif(current_setting('app.business_id', true), '')::uuid;
  v_platform boolean := coalesce(nullif(current_setting('app.is_platform', true), ''), 'false') = 'true';
BEGIN
  IF v_business IS NULL THEN
    IF p_allow_system THEN
      RETURN;
    END IF;
    RAISE EXCEPTION '%: işletme bağlamı gerekli', p_fn USING ERRCODE = '42501';
  END IF;
  IF v_platform THEN
    RAISE EXCEPTION '%: platform bağlamında işletme kimliği olamaz', p_fn USING ERRCODE = '42501';
  END IF;
  IF p_allow_seller AND EXISTS (
    SELECT 1
      FROM public.business_capabilities c
      JOIN public.businesses b ON b.id = c.business_id
     WHERE c.business_id = v_business
       AND c.capability = 'seller'
       AND c.status = 'approved'
       AND b.status = 'active'
  ) THEN
    RETURN;
  END IF;
  RAISE EXCEPTION '%: onaylı toptancı bağlamı gerekli', p_fn USING ERRCODE = '42501';
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "directory_assert_caller"(text, boolean, boolean) FROM PUBLIC;
--> statement-breakpoint
-- Dizin belgesi (US-007 AC1–AC2): yalnız `buyer` yeteneği onaylı ve işletmesi `active` olanlar.
-- Ünvan, faaliyet alanı, bölge (ve şehir) her zaman; diğer alanlar yalnız gizlilik ayarı açıksa.
-- `listed_in_directory` döner: kapalıysa tüketici belgeyi indeksten siler (US-007 AC4).
-- Dönmeyen kimlik = indekslenemez (silinir). En fazla 1000 kimlik.
CREATE FUNCTION "directory_buyer_documents"(p_ids uuid[])
  RETURNS TABLE (
    id uuid,
    legal_name text,
    activity_type_id uuid,
    region_id uuid,
    city_id uuid,
    verified boolean,
    listed_in_directory boolean,
    logo_file_id uuid,
    address_line text,
    business_phone text,
    voen text,
    contact_name text
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM public.directory_assert_caller('directory_buyer_documents', true, true);
  IF coalesce(cardinality(p_ids), 0) > 1000 THEN
    RAISE EXCEPTION 'directory_buyer_documents: en fazla 1000 kimlik' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT b.id,
         b.legal_name,
         bp.activity_type_id,
         b.region_id,
         CASE WHEN r.type = 'district' THEN r.parent_id ELSE r.id END,
         b.verified_at IS NOT NULL,
         bp.listed_in_directory,
         CASE WHEN pr.show_logo THEN b.logo_file_id END,
         CASE WHEN pr.show_address THEN b.address_line END,
         CASE WHEN pr.show_business_phone THEN b.business_phone END,
         CASE WHEN pr.show_voen THEN b.voen::text END,
         CASE WHEN pr.show_contact_name THEN pd.contact_name END
    FROM public.businesses b
    JOIN public.business_capabilities c
      ON c.business_id = b.id AND c.capability = 'buyer' AND c.status = 'approved'
    JOIN public.buyer_profiles bp ON bp.business_id = b.id
    JOIN public.business_privacy pr ON pr.business_id = b.id
    JOIN public.regions r ON r.id = b.region_id
    LEFT JOIN public.person_data pd ON pd.business_id = b.id
   WHERE b.id = ANY (p_ids)
     AND b.status = 'active';
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "directory_buyer_documents"(uuid[]) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "directory_buyer_documents"(uuid[]) TO app_user;
--> statement-breakpoint
-- Yeniden indeksleme sayfası: dizinde görünmesi gereken perakendecilerin kimlikleri, `id` sırasıyla
-- `p_after`'dan sonra en fazla `p_limit` (1–1000). Yalnız bağlamsız sistem / platform işlemi.
CREATE FUNCTION "directory_buyer_page"(p_after uuid, p_limit integer)
  RETURNS SETOF uuid
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM public.directory_assert_caller('directory_buyer_page', true, false);
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'directory_buyer_page: p_limit 1–1000 olmalı' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT b.id
    FROM public.businesses b
    JOIN public.business_capabilities c
      ON c.business_id = b.id AND c.capability = 'buyer' AND c.status = 'approved'
    JOIN public.buyer_profiles bp ON bp.business_id = b.id
   WHERE b.status = 'active'
     AND bp.listed_in_directory
     AND (p_after IS NULL OR b.id > p_after)
   ORDER BY b.id
   LIMIT p_limit;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "directory_buyer_page"(uuid, integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "directory_buyer_page"(uuid, integer) TO app_user;
--> statement-breakpoint
-- Tam eşleşme (US-020 AC1–AC2, US-007 AC4): tam E.164 telefon veya 10 haneli VÖEN; ikisinden
-- yalnız biri. Kısmi veya biçimsiz değer eşleşmez (boş sonuç). "Dizinde görünme" kapalı olsa da
-- bulur; askıya alınmış, pasif veya onaysız perakendeciyi bulmaz. Yalnız kimlik döner (alanlar
-- directory_buyer_documents ile, yalnız açık olanlar). Telefon (kullanıcı kararı 2026-11-09):
-- işletme telefonu, kişisel telefon veya işletme admini aktif üyenin giriş telefonu. İşletme
-- telefonu serbest biçimlidir: yalnız rakamları karşılaştırılır (`+994 12 555-55-55` eşleşir,
-- başında ülke kodu olmayan yerel yazım eşleşmez).
CREATE FUNCTION "directory_buyer_exact_match"(p_phone text, p_voen text)
  RETURNS SETOF uuid
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM public.directory_assert_caller('directory_buyer_exact_match', false, true);
  IF (p_phone IS NULL) = (p_voen IS NULL) THEN
    RAISE EXCEPTION 'directory_buyer_exact_match: telefon veya VÖEN (yalnız biri)' USING ERRCODE = '22023';
  END IF;
  IF p_phone IS NOT NULL AND p_phone !~ '^\+[1-9][0-9]{7,14}$' THEN
    RETURN;
  END IF;
  IF p_voen IS NOT NULL AND p_voen !~ '^[0-9]{9}[12]$' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT b.id
    FROM public.businesses b
    JOIN public.business_capabilities c
      ON c.business_id = b.id AND c.capability = 'buyer' AND c.status = 'approved'
   WHERE b.status = 'active'
     AND (
       (p_voen IS NOT NULL AND b.voen = p_voen)
       OR (p_phone IS NOT NULL AND (
         (b.business_phone IS NOT NULL
          AND regexp_replace(b.business_phone, '[^0-9]', '', 'g') = substr(p_phone, 2))
         OR EXISTS (
           SELECT 1 FROM public.person_data pd
            WHERE pd.business_id = b.id AND pd.personal_phone = p_phone
         )
         OR EXISTS (
           SELECT 1
             FROM public.users u
             JOIN public.memberships m ON m.user_id = u.id AND m.status = 'active'
             JOIN public.roles ro ON ro.id = m.role_id AND ro.is_business_admin
            WHERE u.phone_e164 = p_phone
              AND u.status = 'active'
              AND m.business_id = b.id
         )
       ))
     )
   ORDER BY b.id
   LIMIT 20;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "directory_buyer_exact_match"(text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "directory_buyer_exact_match"(text, text) TO app_user;
