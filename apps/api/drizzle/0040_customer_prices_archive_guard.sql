-- F3.7b (Müfettiş 30 not 1, R40): arşiv ile müşteri fiyatı yazımı yarışı. 0039 tetikleyicisi
-- arşivlenen perakendecinin satırlarını siler; ancak aynı anda işlenmemiş bir yazım (bağlantı satırı
-- `FOR SHARE` ile kilitli) silmeyi görmeden kalabilir. İki parça:
-- 1) `businesses_archived_clear_customer_prices` silmeden önce perakendecinin aktif bağlantı
--    satırlarını `FOR NO KEY UPDATE` ile kilitler. Yazım hep aynı sırayla kilitler: önce bağlantı
--    satırı (`FOR SHARE`), sonra fiyat satırı. Arşiv de: işletme satırı, bağlantı satırı, fiyat
--    satırı. Tablo kilidi yok (Müfettiş 31 B1: tablo kilidi + bağlantı satırı ters sırayla
--    `business_close_archived_connections` akışında kilitlenme yaratıyordu). Süren yazım bitene
--    kadar arşiv bekler; sonra silme taze anlık görüntüyle o satırı da görür (plpgsql VOLATILE).
--    Fiyat yazımının işletme satırına aldığı FK kilidi (KEY SHARE) durum güncellemesiyle
--    (NO KEY UPDATE) çakışmaz.
-- 2) `customer_prices_buyer_guard` (BEFORE INSERT): perakendeci arşivliyse yazım `55000` ile
--    reddedilir. Arşivden sonra başlayan yazım ya kapanmış bağlantıyı görür (CONNECTION_INACTIVE)
--    ya da bağlantı kapatılmayan yolda burada arşivli durumu görür.
-- İki fonksiyon migrator sahipli SECURITY DEFINER (D6: search_path pg_temp ile biter, PUBLIC yok,
-- app_user EXECUTE; tetikleyici fonksiyonu doğrudan çağrılamaz). Bağlantı kilidi migrator'ın
-- platform politikalarıyla (`connections_definer_platform_update`) yalnız platform işleminde
-- satır görür; arşiv yalnız platform işleminde yapılır.
CREATE OR REPLACE FUNCTION "businesses_archived_clear_customer_prices"() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM 1 FROM public.connections c
    WHERE c.buyer_id = NEW.id AND c.status = 'active'
    ORDER BY c.id
    FOR NO KEY UPDATE;
  DELETE FROM public.customer_prices WHERE buyer_id = NEW.id;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION "customer_prices_buyer_guard"() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.businesses b
              WHERE b.id = NEW.buyer_id AND b.status = 'archived') THEN
    RAISE EXCEPTION 'customer_prices: perakendeci arşivli' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "customer_prices_buyer_guard"() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "customer_prices_buyer_guard"() TO app_user;
--> statement-breakpoint
CREATE TRIGGER "customer_prices_buyer_guard"
  BEFORE INSERT ON "customer_prices"
  FOR EACH ROW
  EXECUTE FUNCTION "customer_prices_buyer_guard"();
