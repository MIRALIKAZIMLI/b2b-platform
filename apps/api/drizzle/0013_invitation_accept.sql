-- Elle eklenen bölüm aşağıda; drizzle-kit bu dosyayı yeniden üretmez.
-- F2.1a: davet kabulü (US-009 AC2, US-013; faz spesifikasyonu R16, R17). Yeni tablo yok.
--
-- Kabul eden kullanıcı henüz işletmenin üyesi değildir; invitations (T) bağlamsız 0 satır döner.
-- Platform bağlamı yalnızca platform-admin uçlarında açılır (c4 §3.7), bu yüzden kabul migrator
-- sahipli SECURITY DEFINER fonksiyonla yapılır. Tablolar FORCE RLS olduğundan fonksiyonun
-- okuyup yazabilmesi için yalnızca migrator rolüne açık politikalar eklenir; app_user bu rolü
-- üstlenemez, politikalar yalnızca SECURITY DEFINER fonksiyonların içinde etkilidir.
CREATE POLICY "invitations_definer_select" ON "invitations" FOR SELECT TO migrator USING (true);
--> statement-breakpoint
CREATE POLICY "invitations_definer_update" ON "invitations" FOR UPDATE TO migrator
  USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY "businesses_definer_select" ON "businesses" FOR SELECT TO migrator USING (true);
--> statement-breakpoint
-- Yalnızca çağıran kullanıcı (app.user_id) adına üyelik eklenebilir.
CREATE POLICY "memberships_definer_insert" ON "memberships" FOR INSERT TO migrator
  WITH CHECK ("user_id" = nullif(current_setting('app.user_id', true), '')::uuid);
--> statement-breakpoint
-- Daveti çağıran kullanıcı adına kabul eder. Kullanıcı parametreden değil app.user_id'den alınır
-- (push_token_register kalıbı); bağlam yoksa 42501. Token'ın kendisi değil SHA-256 özeti gelir.
-- Davet satırı FOR UPDATE ile kilitlenir: eşzamanlı iki kabulde ikincisi kilidi bekler, satırı
-- kabul edilmiş görür ve hiçbir şey yazmaz. Koşullar: davet var, kabul edilmemiş, süresi dolmamış
-- (expires_at > p_now), kullanıcı aktif ve telefonu davetteki telefonla aynı, işletme aktif,
-- kullanıcı o işletmede (herhangi bir durumda) üyeliği yok. Biri tutmazsa hiçbir şey yazılmaz ve
-- boş sonuç döner; uygulama her durumda aynı 404'ü verir (R16). Zaman uygulamanın Clock'undan,
-- üyelik kimliği uygulamanın UUIDv7 üreticisinden gelir.
CREATE FUNCTION "invitation_accept"(p_token_hash text, p_membership_id uuid, p_now timestamptz)
  RETURNS TABLE (business_id uuid, invitation_id uuid, membership_id uuid)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_user uuid := nullif(current_setting('app.user_id', true), '')::uuid;
  v_inv public.invitations%ROWTYPE;
  v_phone text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'invitation_accept: kullanıcı bağlamı yok' USING ERRCODE = '42501';
  END IF;

  SELECT i.* INTO v_inv
    FROM public.invitations i
   WHERE i.token_hash = p_token_hash
   FOR UPDATE;
  IF NOT FOUND OR v_inv.accepted_at IS NOT NULL OR v_inv.expires_at <= p_now THEN
    RETURN;
  END IF;

  SELECT u.phone_e164 INTO v_phone
    FROM public.users u
   WHERE u.id = v_user AND u.status = 'active';
  IF v_phone IS NULL OR v_phone <> v_inv.phone_e164 THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.businesses b WHERE b.id = v_inv.business_id AND b.status = 'active'
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.memberships m
     WHERE m.user_id = v_user AND m.business_id = v_inv.business_id
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.memberships
    (id, user_id, business_id, role_id, job_title_id, branch_id, warehouse_id, status,
     joined_at, created_at, updated_at)
  VALUES
    (p_membership_id, v_user, v_inv.business_id, v_inv.role_id, v_inv.job_title_id,
     v_inv.branch_id, v_inv.warehouse_id, 'active', p_now, p_now, p_now);

  UPDATE public.invitations SET accepted_at = p_now WHERE id = v_inv.id;

  business_id := v_inv.business_id;
  invitation_id := v_inv.id;
  membership_id := p_membership_id;
  RETURN NEXT;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "invitation_accept"(text, uuid, timestamptz) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "invitation_accept"(text, uuid, timestamptz) TO app_user;
