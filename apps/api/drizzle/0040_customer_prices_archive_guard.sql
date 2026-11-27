-- F3.7b (Müfettiş 30 not 1, R40): arşiv ile müşteri fiyatı yazımı yarışı. 0039 tetikleyicisi
-- arşivlenen perakendecinin satırlarını siler; ancak aynı anda işlenmemiş bir yazım (bağlantı satırı
-- `FOR SHARE` ile kilitli) silmeyi görmeden kalabilir. İki parça:
-- 1) `businesses_archived_clear_customer_prices` silmeden önce `customer_prices` tablosunu
--    SHARE ROW EXCLUSIVE kilitler: süren her yazım (ROW EXCLUSIVE) bitene kadar bekler, sonra silme
--    taze anlık görüntüyle o satırları da görür. Arşiv seyrek; kilit yalnız arşiv işlemi boyunca.
-- 2) `customer_prices_buyer_guard` (BEFORE INSERT): perakendeci arşivliyse yazım `55000` ile
--    reddedilir. Arşiv kilidi alındıktan sonra başlayan yazım arşivin bitmesini bekler ve burada
--    arşivli durumu görür (plpgsql VOLATILE: her sorgu taze anlık görüntü).
-- İki fonksiyon migrator sahipli SECURITY DEFINER (D6: search_path pg_temp ile biter, PUBLIC yok,
-- app_user EXECUTE; tetikleyici fonksiyonu doğrudan çağrılamaz).
CREATE OR REPLACE FUNCTION "businesses_archived_clear_customer_prices"() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  LOCK TABLE public.customer_prices IN SHARE ROW EXCLUSIVE MODE;
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
