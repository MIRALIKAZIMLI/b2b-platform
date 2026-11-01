ALTER TABLE "branches" ALTER COLUMN "address_line" DROP NOT NULL;--> statement-breakpoint
-- ===== Elle eklenen bölüm (F2.3a: kimliksiz perakendeci kaydı, US-005, SF-02) =====
-- Kayıt tek kiracı işleminde yapılır: withTenantTx({ businessId: yeni, userId: yeni }) (R15).
-- İşletme, yetenek, profiller, şube, rol ve üyelik mevcut kiracı politikalarıyla yazılır (F1.7).
-- Kiracının yazamadığı iki satır (users, subscriptions) ve telefon kapsamlı idempotens kaydı
-- aşağıdaki migrator sahipli SECURITY DEFINER fonksiyonlarla yazılır. Fonksiyonlar kimlikleri
-- parametreden değil app.user_id / app.business_id bağlamından alır; zaman Clock'tan gelir.
-- Aşağıdaki TO migrator politikaları yalnızca bu fonksiyonların içinde etkilidir (app_user
-- migrator rolünü üstlenemez).
CREATE POLICY "users_definer_insert" ON "users" FOR INSERT TO migrator
  WITH CHECK ("id" = nullif(current_setting('app.user_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "subscriptions_definer_insert" ON "subscriptions" FOR INSERT TO migrator
  WITH CHECK (
    "business_id" = nullif(current_setting('app.business_id', true), '')::uuid
    AND "status" = 'active'
  );
--> statement-breakpoint
-- Kayıt olan kullanıcı (app.user_id). Telefon zaten kayıtlıysa users_phone_e164_uq 23505 verir;
-- eşzamanlı ikinci kayıt bu satırda ilk işlemin bitmesini bekler (R13).
CREATE FUNCTION "user_create_self_signup"(
  p_phone_e164 text,
  p_full_name text,
  p_preferred_language text,
  p_now timestamptz
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_user uuid := nullif(current_setting('app.user_id', true), '')::uuid;
BEGIN
  IF v_user IS NULL OR nullif(current_setting('app.business_id', true), '') IS NULL THEN
    RAISE EXCEPTION 'user_create_self_signup: kiracı ve kullanıcı bağlamı gerekli'
      USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.users
    (id, phone_e164, full_name, preferred_language, status, created_at, updated_at)
  VALUES
    (v_user, p_phone_e164, p_full_name, p_preferred_language, 'active', p_now, p_now);
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "user_create_self_signup"(text, text, text, timestamptz) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "user_create_self_signup"(text, text, text, timestamptz) TO app_user;
--> statement-breakpoint
-- Kendi kaydolan perakendecinin ilk aboneliği (R14). Yalnızca bağlamdaki işletme; işletme
-- `self_signup` + `active`, `buyer` yeteneği `approved`, hiç aboneliği yok; plan aktif, `buyer`
-- ve ücretsiz. Koşul tutmazsa hiçbir şey yazılmaz, 42501.
CREATE FUNCTION "subscription_start_self_signup"(
  p_id uuid,
  p_plan_id uuid,
  p_period_start date,
  p_period_end date,
  p_now timestamptz
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_business uuid := nullif(current_setting('app.business_id', true), '')::uuid;
BEGIN
  IF v_business IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.businesses b
        WHERE b.id = v_business AND b.created_via = 'self_signup' AND b.status = 'active')
     OR NOT EXISTS (
       SELECT 1 FROM public.business_capabilities c
        WHERE c.business_id = v_business AND c.capability = 'buyer' AND c.status = 'approved')
     OR EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.business_id = v_business)
     OR NOT EXISTS (
       SELECT 1 FROM public.plans p
        WHERE p.id = p_plan_id AND p.capability = 'buyer' AND p.is_active AND p.price = 0)
  THEN
    RAISE EXCEPTION 'subscription_start_self_signup: koşul sağlanmadı' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.subscriptions
    (id, business_id, plan_id, status, current_period_start, current_period_end,
     created_at, updated_at)
  VALUES
    (p_id, v_business, p_plan_id, 'active', p_period_start, p_period_end, p_now, p_now);
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "subscription_start_self_signup"(uuid, uuid, date, date, timestamptz) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "subscription_start_self_signup"(uuid, uuid, date, date, timestamptz) TO app_user;
--> statement-breakpoint
-- Kimliksiz kayıt idempotensi (R13: kapsam pendingToken'daki telefon). Sonuç:
--   new        : bu telefonla kullanıcı yok, kayıt yapılabilir
--   registered : kullanıcı var, bu anahtarla saklı yanıt yok (anahtar yok, başka anahtar, süresi dolmuş)
--   conflict   : aynı anahtar farklı istek özetiyle kayıtlı
--   replay     : aynı anahtar ve aynı istekle tamamlanmış yanıt (stored_status, stored_body)
CREATE FUNCTION "idempotency_lookup_by_phone"(
  p_phone_e164 text,
  p_key text,
  p_endpoint text,
  p_request_hash text,
  p_now timestamptz
)
  RETURNS TABLE (result text, stored_status integer, stored_body jsonb)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_user uuid;
  existing public.idempotency_keys%ROWTYPE;
BEGIN
  SELECT u.id INTO v_user FROM public.users u WHERE u.phone_e164 = p_phone_e164;
  IF v_user IS NULL THEN
    RETURN QUERY SELECT 'new'::text, NULL::integer, NULL::jsonb;
    RETURN;
  END IF;
  IF p_key IS NOT NULL THEN
    SELECT k.* INTO existing
      FROM public.idempotency_keys k
     WHERE k.key = p_key AND k.user_id = v_user AND k.endpoint = p_endpoint
       AND k.expires_at > p_now AND k.status_code IS NOT NULL;
    IF FOUND THEN
      IF existing.request_hash <> p_request_hash THEN
        RETURN QUERY SELECT 'conflict'::text, NULL::integer, NULL::jsonb;
      ELSE
        RETURN QUERY SELECT 'replay'::text, existing.status_code, existing.response_body;
      END IF;
      RETURN;
    END IF;
  END IF;
  RETURN QUERY SELECT 'registered'::text, NULL::integer, NULL::jsonb;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "idempotency_lookup_by_phone"(text, text, text, text, timestamptz) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "idempotency_lookup_by_phone"(text, text, text, text, timestamptz) TO app_user;
--> statement-breakpoint
-- Tamamlanmış yanıtı handler işleminin içinde yazar (R12): kayıt geri alınırsa yanıt da yoktur.
-- Kullanıcı app.user_id'den alınır.
CREATE FUNCTION "idempotency_store"(
  p_key text,
  p_endpoint text,
  p_request_hash text,
  p_status_code integer,
  p_response_body jsonb,
  p_expires_at timestamptz
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_user uuid := nullif(current_setting('app.user_id', true), '')::uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'idempotency_store: kullanıcı bağlamı gerekli' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.idempotency_keys
    (key, user_id, endpoint, request_hash, status_code, response_body, locked_until, expires_at)
  VALUES
    (p_key, v_user, p_endpoint, p_request_hash, p_status_code, p_response_body, NULL, p_expires_at);
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "idempotency_store"(text, text, text, integer, jsonb, timestamptz) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "idempotency_store"(text, text, text, integer, jsonb, timestamptz) TO app_user;
