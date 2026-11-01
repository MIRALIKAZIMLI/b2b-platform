-- Elle yazılan migration; drizzle-kit bu dosyayı yeniden üretmez. Yeni tablo/kolon yok.
-- F2.4 VÖEN girişi (US-006 AC2; F2 faz spesifikasyonu R20; data-model §4.4 alan koruması).
--
-- businesses_guard_platform_columns iki kural kazanır (her bağlamda, kiracı kontrolünden sonra):
-- 1. legal_type VÖEN'in son hanesinden türetilir (1 = legal_entity, 2 = individual_entrepreneur,
--    VÖEN yoksa null). Uygulama yanlış değer gönderse de tablo VÖEN ile tutarlı kalır.
-- 2. R20: UPDATE'te voen değişir ve aynı ifadede verified_at / verified_by değiştirilmezse
--    doğrulama rozeti sıfırlanır (verified_at = verified_by = null). Kiracı bu alanları yine
--    kendisi yazamaz (42501); platform aynı ifadede VÖEN + doğrulama yazarsa (F2.18) korunur.
-- Fonksiyon SECURITY DEFINER değildir (tablo okumaz); search_path sabit, PUBLIC çalıştıramaz.
-- CREATE OR REPLACE yetkileri ve tetikleyiciyi korur; REVOKE yine de yinelenir.
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
