-- Elle yazılan migration; drizzle-kit bu dosyayı yeniden üretmez. Yeni tablo/kolon yok.
-- F2.19 admin ayarlar ekranı (US-017 AC1; data-model §4.3). `settings` S tablosudur: app_user
-- tabloyu doğrudan okuyamaz; ekran bir kapsamın tüm anahtarlarını bu fonksiyonla okur.
--
-- settings_admin_list(p_scope, p_scope_id): yalnız platform bağlamında (`app.is_platform`).
--   Döner: platform satırları; p_scope = 'plan' ise o planın satırları; p_scope = 'business' ise
--   işletmenin satırları ve işletmenin güncel aboneliğinin (active / grace / read_only) planının
--   satırları (settings_get ile aynı plan seçimi, 0005). Değer doğrulaması uygulamada.
CREATE FUNCTION settings_admin_list(p_scope text, p_scope_id uuid)
RETURNS TABLE (scope text, key text, value jsonb, updated_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF coalesce(current_setting('app.is_platform', true), '') <> 'true' THEN
    RAISE EXCEPTION 'settings_admin_list yalnızca platform bağlamında çalışır'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
    SELECT s.scope, s.key, s.value, s.updated_at
      FROM public.settings s
     WHERE s.scope = 'platform'
        OR (p_scope = 'plan' AND s.scope = 'plan' AND s.scope_id = p_scope_id)
        OR (p_scope = 'business' AND s.scope = 'business' AND s.scope_id = p_scope_id)
        OR (
          p_scope = 'business'
          AND s.scope = 'plan'
          AND s.scope_id = (
            SELECT sub.plan_id
              FROM public.subscriptions sub
             WHERE sub.business_id = p_scope_id
               AND sub.status IN ('active', 'grace', 'read_only')
          )
        );
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION settings_admin_list(text, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION settings_admin_list(text, uuid) TO app_user;
