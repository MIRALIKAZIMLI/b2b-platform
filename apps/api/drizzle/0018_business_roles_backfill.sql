-- ===== Elle yazılan migration (F2.7c, US-013 AC1; Mimar kararı A, 2026-11-02) =====
-- Yeni tablo yok; check-rls sınıfları değişmez.
--
-- Sorun: işletme açılışında (F2.1a toptancı, F2.3a perakendeci) yalnız admin şablonu rol olarak
-- kopyalanıyordu; ekip davetinde (F2.7) unvanın rolü işletmede olmadığı için başka rol seçilemiyordu.
-- Uygulama artık açılışta yeteneğin tüm şablonlarını kopyalar (RoleService.copyCapabilityTemplatesTx).
-- Bu migration var olan işletmeleri tamamlar.
--
-- business_roles_backfill(p_business_id): her işletme yeteneği için (p_business_id verilirse yalnız
-- o işletme) o yeteneğin henüz kopyalanmamış her şablonunu (`roles.source_template_id` yoksa)
-- izinleriyle birlikte rol olarak açar; açılan rol sayısını döner.
-- Tekrar çalıştırılabilir (zaten kopyalanmış şablon atlanır). SECURITY DEFINER değildir: çağıranın
-- RLS'i geçerlidir ve yalnız platform bağlamında (`app.is_platform = true`) çalışır, yoksa 42501.
-- PUBLIC'in EXECUTE hakkı kaldırılır. Şablonlar seed'den gelir; boş veritabanında (seed öncesi)
-- hiçbir şey yapmaz.
CREATE FUNCTION "business_roles_backfill"(p_business_id uuid DEFAULT NULL)
  RETURNS integer
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_count integer := 0;
  v_role_id uuid;
  r record;
BEGIN
  IF current_setting('app.is_platform', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'business_roles_backfill platform bağlamı ister' USING ERRCODE = '42501';
  END IF;
  FOR r IN
    SELECT bc.business_id, t.id AS template_id, t.name, t.capability, t.is_business_admin, t.version
      FROM business_capabilities bc
      JOIN role_templates t ON t.capability = bc.capability
     WHERE (p_business_id IS NULL OR bc.business_id = p_business_id)
       AND NOT EXISTS (
             SELECT 1 FROM roles x
              WHERE x.business_id = bc.business_id AND x.source_template_id = t.id)
     ORDER BY bc.business_id, t.code
  LOOP
    v_role_id := gen_random_uuid();
    INSERT INTO roles (id, business_id, name, capability, is_business_admin,
                       source_template_id, source_template_version)
    VALUES (v_role_id, r.business_id, r.name, r.capability, r.is_business_admin,
            r.template_id, r.version);
    INSERT INTO role_permissions (role_id, permission_code, scope)
    SELECT v_role_id, p.permission_code, p.default_scope
      FROM role_template_permissions p
     WHERE p.template_id = r.template_id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "business_roles_backfill"(uuid) FROM PUBLIC;
--> statement-breakpoint
-- Var olan işletmeler: migration işleminde platform bağlamı kurulur, iş bitince bırakılır.
SELECT set_config('app.is_platform', 'true', true);
--> statement-breakpoint
SELECT "business_roles_backfill"(NULL);
--> statement-breakpoint
SELECT set_config('app.is_platform', '', true);
