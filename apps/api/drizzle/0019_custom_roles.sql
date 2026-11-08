-- ===== F2.8 (US-014, R22, Müfettiş 12 notu 1): işletmeye özel rol =====
-- Yeni tablo yok; check-rls sınıfları değişmez (`roles` T, RLS 0005'te).
-- is_custom: şablondan kopyalanıp izinleri değiştirilmiş rol (yalnız bunlar düzenlenir).
-- permissions_version: izinler her değiştiğinde artar; izin önbelleği bununla doğrulanır.
-- roles_business_template_copy_uq: aynı şablonun ikinci kopyası açılamaz (açılış + backfill
-- eşzamanlılığına karşı DB koruması); özel roller kısıta girmez. F2.7c sonrası çift kopya yoktur.
ALTER TABLE "roles" ADD COLUMN "is_custom" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "permissions_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "roles_business_template_copy_uq" ON "roles" USING btree ("business_id","source_template_id") WHERE "roles"."source_template_id" is not null and not "roles"."is_custom";--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_permissions_version_check" CHECK ("roles"."permissions_version" >= 1);