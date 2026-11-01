ALTER TABLE "users" ADD COLUMN "last_business_id" uuid;--> statement-breakpoint
-- ===== Elle eklenen bölüm aşağıda (F2.7a: ekip yönetimi, US-013; F2 spesifikasyonu R16, S8) =====
-- Yeni tablo yok; check-rls sınıfları değişmez.
--
-- 1. Son kullanılan işletme (US-003 AC1, S8). Şema identity'de, FK businesses'a: c4 yönü
--    `businesses → identity` olduğundan şemada değil burada (F1.5a FK kalıbı).
ALTER TABLE "users" ADD CONSTRAINT "users_last_business_id_businesses_id_fk"
  FOREIGN KEY ("last_business_id") REFERENCES "public"."businesses"("id");
--> statement-breakpoint
-- 2. Ekip ekranı: bağlamdaki işletmenin aktif üyeleri birbirinin kullanıcı satırını okur
--    (data-model §4.1 "üyelik üzerinden görme"). İşletme koşulu açıkça yazılır; yalnızca okuma.
CREATE POLICY "users_member_select" ON "users" FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM "memberships" m
     WHERE m."user_id" = "users"."id"
       AND m."status" = 'active'
       AND m."business_id" = nullif(current_setting('app.business_id', true), '')::uuid
  ));
--> statement-breakpoint
-- 3. Davet edilen kişinin kullanıcı satırı (S3 = A deseni; Mimar F2.7 K1). Kiracı users'a
--    yazamaz; bu fonksiyon yazar. Yalnızca app.business_id + app.user_id bağlamında ve çağıranın
--    o işletmede `team.manage` izinli aktif üyeliği varsa çalışır, yoksa 42501. Telefon kayıtlıysa
--    var olan kimlik döner (ad değişmez), değilse p_id ile oluşturulur. Yalnız kimlik döner:
--    kişinin daha önce kayıtlı olup olmadığı veya adı dışarı verilmez. Eşzamanlı iki davette
--    ON CONFLICT ikinci isteği var olan satıra düşürür.
CREATE POLICY "users_definer_insert_invited" ON "users" FOR INSERT TO migrator
  WITH CHECK (nullif(current_setting('app.business_id', true), '') IS NOT NULL);
--> statement-breakpoint
CREATE FUNCTION "user_ensure_for_invitation"(
  p_id uuid,
  p_phone_e164 text,
  p_full_name text,
  p_now timestamptz
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actor uuid := nullif(current_setting('app.user_id', true), '')::uuid;
  v_business uuid := nullif(current_setting('app.business_id', true), '')::uuid;
  v_id uuid;
BEGIN
  IF v_actor IS NULL OR v_business IS NULL OR NOT EXISTS (
    SELECT 1
      FROM public.memberships m
      JOIN public.role_permissions rp ON rp.role_id = m.role_id
     WHERE m.user_id = v_actor
       AND m.business_id = v_business
       AND m.status = 'active'
       AND rp.permission_code = 'team.manage'
  ) THEN
    RAISE EXCEPTION 'user_ensure_for_invitation: team.manage yetkisi yok' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.users (id, phone_e164, full_name, status, created_at, updated_at)
  VALUES (p_id, p_phone_e164, p_full_name, 'active', p_now, p_now)
  ON CONFLICT (phone_e164) DO NOTHING;

  SELECT u.id INTO v_id FROM public.users u WHERE u.phone_e164 = p_phone_e164;
  RETURN v_id;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "user_ensure_for_invitation"(uuid, text, text, timestamptz) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "user_ensure_for_invitation"(uuid, text, text, timestamptz) TO app_user;
--> statement-breakpoint
-- 4. Kabul (0013) genişler (Mimar F2.7 K5; Müfettiş 6 notu): kullanıcının o işletmede `removed`
--    üyeliği varsa aynı satır davetteki rol, unvan, şube ve depo ile `active` olur (eski rol ve
--    kapsam kullanılmaz). Aktif üyelik varsa önceki gibi hiçbir şey yazılmaz (uç 404). Bölgeler
--    çıkarmada silindiği için burada dokunulmaz. Güncelleme politikası yalnız migrator'a ve
--    yalnız çağıran kullanıcının satırlarına açıktır.
CREATE POLICY "memberships_definer_update" ON "memberships" FOR UPDATE TO migrator
  USING ("user_id" = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK ("user_id" = nullif(current_setting('app.user_id', true), '')::uuid);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "invitation_accept"(p_token_hash text, p_membership_id uuid, p_now timestamptz)
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
  v_existing_id uuid;
  v_existing_status text;
  v_membership uuid;
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

  SELECT m.id, m.status INTO v_existing_id, v_existing_status
    FROM public.memberships m
   WHERE m.user_id = v_user AND m.business_id = v_inv.business_id
   FOR UPDATE;

  IF v_existing_id IS NULL THEN
    INSERT INTO public.memberships
      (id, user_id, business_id, role_id, job_title_id, branch_id, warehouse_id, status,
       joined_at, created_at, updated_at)
    VALUES
      (p_membership_id, v_user, v_inv.business_id, v_inv.role_id, v_inv.job_title_id,
       v_inv.branch_id, v_inv.warehouse_id, 'active', p_now, p_now, p_now);
    v_membership := p_membership_id;
  ELSIF v_existing_status = 'removed' THEN
    UPDATE public.memberships
       SET role_id = v_inv.role_id,
           job_title_id = v_inv.job_title_id,
           branch_id = v_inv.branch_id,
           warehouse_id = v_inv.warehouse_id,
           status = 'active',
           joined_at = p_now,
           updated_at = p_now
     WHERE id = v_existing_id;
    v_membership := v_existing_id;
  ELSE
    RETURN;
  END IF;

  UPDATE public.invitations SET accepted_at = p_now WHERE id = v_inv.id;

  business_id := v_inv.business_id;
  invitation_id := v_inv.id;
  membership_id := v_membership;
  RETURN NEXT;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "invitation_accept"(text, uuid, timestamptz) FROM PUBLIC;
