-- F1.4a düzeltme: SECURITY DEFINER fonksiyonlarda pg_temp search_path'in en sonunda olmalı.
-- Aksi hâlde PostgreSQL pg_temp'i örtük olarak en başta arar; geçici şemadaki bir nesne
-- fonksiyonun çağırdığı adı gölgeleyebilir.
-- Geri alma: aynı ALTER FUNCTION'ı 'pg_catalog, public' değeriyle çalıştır.
ALTER FUNCTION settings_get(text, uuid) SET search_path = pg_catalog, public, pg_temp;
--> statement-breakpoint
ALTER FUNCTION settings_put(text, uuid, text, jsonb) SET search_path = pg_catalog, public, pg_temp;
