-- ===== F2.11b (US-019, US-020, US-007 AC2, AC4–AC6, TM-09, TM-10) =====
-- Dizin arama sonucunun kartı. Kimlikler yalnız Meilisearch sonucundan veya
-- directory_buyer_exact_match'ten gelir (Müfettiş 15 L1); alanlar her istekte DB'den taze okunur
-- (gizlilik değişikliği indeks güncellenmesini beklemeden geçerli, Mimar K6).
-- directory_buyer_documents'tan farkı: yalnız onaylı seller bağlamı, en fazla 20 kimlik; kişisel
-- telefon ve e-posta (yalnız show_personal_contact açıkken, US-007 AC2), logo nesne anahtarı
-- (yalnız show_logo açık ve dosya `ready`), bölge / faaliyet adları. İndeks belgesi değişmez:
-- kişisel iletişim indekse hiç girmez. Bağlantı ve alım hacmi hiç dönmez (US-007 AC6).
-- `files` artık D fonksiyonunca (yalnız logo satırı) okunur: sınıfı `rls:T,D` olur.
--
COMMENT ON TABLE "files" IS 'rls:T,D';
--> statement-breakpoint
CREATE POLICY "files_definer_select" ON "files" FOR SELECT TO migrator USING (true);
--> statement-breakpoint
CREATE FUNCTION "directory_buyer_cards"(p_ids uuid[])
  RETURNS TABLE (
    id uuid,
    legal_name text,
    activity_type_id uuid,
    activity_type_name jsonb,
    region_id uuid,
    region_name jsonb,
    city_id uuid,
    verified boolean,
    listed_in_directory boolean,
    logo_bucket text,
    logo_object_key text,
    address_line text,
    business_phone text,
    voen text,
    contact_name text,
    personal_phone text,
    email text
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM public.directory_assert_caller('directory_buyer_cards', false, true);
  IF coalesce(cardinality(p_ids), 0) > 20 THEN
    RAISE EXCEPTION 'directory_buyer_cards: en fazla 20 kimlik' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT b.id,
         b.legal_name,
         bp.activity_type_id,
         at.name,
         b.region_id,
         r.name,
         CASE WHEN r.type = 'district' THEN r.parent_id ELSE r.id END,
         b.verified_at IS NOT NULL,
         bp.listed_in_directory,
         CASE WHEN pr.show_logo THEN f.bucket END,
         CASE WHEN pr.show_logo THEN f.object_key END,
         CASE WHEN pr.show_address THEN b.address_line END,
         CASE WHEN pr.show_business_phone THEN b.business_phone END,
         CASE WHEN pr.show_voen THEN b.voen::text END,
         CASE WHEN pr.show_contact_name THEN pd.contact_name END,
         CASE WHEN pr.show_personal_contact THEN pd.personal_phone END,
         CASE WHEN pr.show_personal_contact THEN pd.email END
    FROM public.businesses b
    JOIN public.business_capabilities c
      ON c.business_id = b.id AND c.capability = 'buyer' AND c.status = 'approved'
    JOIN public.buyer_profiles bp ON bp.business_id = b.id
    JOIN public.business_privacy pr ON pr.business_id = b.id
    JOIN public.regions r ON r.id = b.region_id
    JOIN public.activity_types at ON at.id = bp.activity_type_id
    LEFT JOIN public.person_data pd ON pd.business_id = b.id
    LEFT JOIN public.files f
      ON f.id = b.logo_file_id
     AND f.owner_business_id = b.id
     AND f.purpose = 'logo'
     AND f.status = 'ready'
   WHERE b.id = ANY (p_ids)
     AND b.status = 'active';
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "directory_buyer_cards"(uuid[]) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "directory_buyer_cards"(uuid[]) TO app_user;
