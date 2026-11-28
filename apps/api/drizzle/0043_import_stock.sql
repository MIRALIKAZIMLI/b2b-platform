-- F3.11c Excel ile stok sayımı (data-model §4.8 `import_jobs.warehouse_id`; kart docs/tasks/F3.11c.md;
-- kullanıcı kararları S3 = A bir dosya bir depo, S1 = A sayılan toplam, S2 = B şablondan sonra değişen
-- stok uygulanmaz). Tablo, RLS ve GRANT değişmez: `warehouse_id` iş açılınca değişmez (UPDATE izni
-- yok; 0037/0038 kolon listesi). `can_write_stock` (V3): ürün işinde stok sütununu yazma hakkı. Stok
-- yine yalnız `stock_movements` ile değişir (0042, R35).
ALTER TABLE "import_jobs" DROP CONSTRAINT "import_jobs_failure_code_check";--> statement-breakpoint
ALTER TABLE "import_jobs" ADD COLUMN "warehouse_id" uuid;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD COLUMN "can_write_stock" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_warehouse_check" CHECK (("import_jobs"."type" = 'stock') = ("import_jobs"."warehouse_id" is not null));--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_failure_code_check" CHECK (("import_jobs"."status" = 'failed') = ("import_jobs"."failure_code" is not null) and ("import_jobs"."failure_code" is null or "import_jobs"."failure_code" in ('FILE_INVALID', 'IMPORT_TOO_MANY_ROWS', 'APPLY_FAILED', 'TIMED_OUT', 'CONNECTION_INACTIVE', 'WAREHOUSE_INACTIVE')));--> statement-breakpoint
-- Elle: deponun aynı satıcıya ait olduğu veritabanında zorlanır (başka satıcının deposuyla iş açılamaz).
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_warehouse_fk" FOREIGN KEY ("seller_id","warehouse_id") REFERENCES "public"."warehouses"("business_id","id") ON DELETE no action ON UPDATE no action;
