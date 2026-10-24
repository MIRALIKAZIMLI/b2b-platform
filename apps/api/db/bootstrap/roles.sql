-- Veritabanı rolleri (docs/03-architecture/infrastructure.md "Veritabanı rolleri").
-- Bu dosya bir migration DEĞİLDİR, bu yüzden apps/api/drizzle/ klasörünün dışındadır:
-- rolleri migrator oluşturamaz. `pnpm db:bootstrap` bu dosyayı süper kullanıcıyla çalıştırır, ardından
-- app_user ve migrator için LOGIN ve şifreyi ortam değişkenlerinden atar (F1.1a K2).
-- Şifre içermez. Tekrar çalıştırılabilir.
--
-- app_user : uygulama; RLS'e tabi, tablo sahibi değil, DDL yok
-- migrator : yalnızca migration; tabloların sahibi
-- readonly : raporlama ve elle inceleme; LOGIN ve tablo izni sonradan verilir
--
-- ALTER DEFAULT PRIVILEGES kullanılmaz: her migration tablo izinlerini GRANT ile verir
-- (S sınıfı tablolarda app_user'ın doğrudan okuma izni yoktur, data-model §1.1).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'migrator') THEN
    CREATE ROLE migrator NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'readonly') THEN
    CREATE ROLE readonly NOLOGIN;
  END IF;
END
$$;

-- Rol zaten varsa da tehlikeli yetkiler kapatılır.
ALTER ROLE app_user NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
ALTER ROLE migrator NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
ALTER ROLE readonly NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO app_user, migrator, readonly', current_database());
  -- migrator, Drizzle'ın migration kayıt şemasını (drizzle) oluşturabilmeli.
  EXECUTE format('GRANT CREATE ON DATABASE %I TO migrator', current_database());
END
$$;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO app_user, readonly;
GRANT USAGE, CREATE ON SCHEMA public TO migrator;
