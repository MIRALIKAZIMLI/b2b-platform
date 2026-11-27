ALTER TABLE "import_jobs" DROP CONSTRAINT "import_jobs_failure_code_check";--> statement-breakpoint
ALTER TABLE "import_jobs" ADD COLUMN "result_report_file_id" uuid;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_failure_code_check" CHECK (("import_jobs"."status" = 'failed') = ("import_jobs"."failure_code" is not null) and ("import_jobs"."failure_code" is null or "import_jobs"."failure_code" in ('FILE_INVALID', 'IMPORT_TOO_MANY_ROWS', 'APPLY_FAILED', 'TIMED_OUT')));--> statement-breakpoint
-- ===== Elle eklenen bölüm (F3.5c; kart docs/tasks/F3.5c.md K10–K12, Müfettiş 29 notları 2, 3, 5) =====
-- Sonuç raporu (US-031 AC3) başka işletmenin dosyasına bağlanamaz (RLS'ten bağımsız bileşik FK).
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_result_file_fk" FOREIGN KEY ("seller_id","result_report_file_id") REFERENCES "public"."files"("owner_business_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Not 3: `can_write_prices` iş açılırken yazılır, sonra değişmez (fiyat izni işi açandan, S1 = A).
REVOKE UPDATE ("can_write_prices") ON TABLE "import_jobs" FROM app_user;
GRANT UPDATE ("result_report_file_id") ON TABLE "import_jobs" TO app_user;
--> statement-breakpoint
-- Sistem işi (DEFINER fonksiyonları, sahibi migrator) artık üç şey yapar: süresi dolan önizlemeyi
-- siler (SF-08), `imports.result_ttl_days` geçen biten işi siler (S2 = A) ve ilerlemeyen işi
-- `TIMED_OUT` ile düşürür (K10). FORCE RLS altında yalnız migrator'a açık politikalar:
-- okuma bütün durumlar (zaman aşımı `uploaded`/`validating`/`applying`'i, silme kalanları görür);
-- silme yalnız `preview_ready`/`done`/`failed`; güncelleme yalnız takılı durumdan `TIMED_OUT`'a.
DROP POLICY "import_jobs_definer_select" ON "import_jobs";
DROP POLICY "import_jobs_definer_expire" ON "import_jobs";
CREATE POLICY "import_jobs_definer_select" ON "import_jobs" FOR SELECT TO migrator
  USING (true);
CREATE POLICY "import_jobs_definer_expire" ON "import_jobs" FOR DELETE TO migrator
  USING ("status" IN ('preview_ready', 'done', 'failed'));
CREATE POLICY "import_jobs_definer_time_out" ON "import_jobs" FOR UPDATE TO migrator
  USING ("status" IN ('uploaded', 'validating', 'applying'))
  WITH CHECK ("status" = 'failed' AND "failure_code" = 'TIMED_OUT');
--> statement-breakpoint
DROP FUNCTION "import_jobs_expire"(timestamptz, integer);
--> statement-breakpoint
-- SF-08 + S2 = A: `p_preview_cutoff`'tan önce güncellenmiş `preview_ready` işler ve
-- `p_result_cutoff`'tan önce güncellenmiş `done`/`failed` işler (toplam en çok `p_limit`) silinir;
-- yüklenen dosya, hata raporu ve sonuç raporu satırları aynı deyimde gider. Depo anahtarları döner;
-- worker nesneleri işlem bittikten sonra siler. Not 5: sınırlar gelecekte olamaz.
CREATE FUNCTION "import_jobs_expire"(
  p_preview_cutoff timestamptz, p_result_cutoff timestamptz, p_limit integer)
  RETURNS TABLE (job_id uuid, seller_id uuid, object_key text)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  IF nullif(current_setting('app.business_id', true), '') IS NOT NULL
     OR nullif(current_setting('app.user_id', true), '') IS NOT NULL
     OR coalesce(nullif(current_setting('app.is_platform', true), ''), 'false') = 'true' THEN
    RAISE EXCEPTION 'import_jobs_expire: yalnız bağlamsız sistem işi' USING ERRCODE = '42501';
  END IF;
  IF p_preview_cutoff IS NULL OR p_result_cutoff IS NULL
     OR p_preview_cutoff > now() OR p_result_cutoff > now()
     OR p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'import_jobs_expire: geçersiz parametre' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH due AS (
    SELECT j.id
      FROM public.import_jobs j
     WHERE (j.status = 'preview_ready' AND j.updated_at < p_preview_cutoff)
        OR (j.status IN ('done', 'failed') AND j.updated_at < p_result_cutoff)
     ORDER BY j.updated_at, j.id
     LIMIT p_limit
  ), removed AS (
    DELETE FROM public.import_jobs j
     USING due
     WHERE j.id = due.id
       AND j.status IN ('preview_ready', 'done', 'failed')
    RETURNING j.id AS job_id, j.seller_id, j.file_id, j.error_report_file_id, j.result_report_file_id
  ), owned AS (
    SELECT r.job_id, r.seller_id, r.file_id AS fid FROM removed r
    UNION ALL
    SELECT r.job_id, r.seller_id, r.error_report_file_id FROM removed r
     WHERE r.error_report_file_id IS NOT NULL
    UNION ALL
    SELECT r.job_id, r.seller_id, r.result_report_file_id FROM removed r
     WHERE r.result_report_file_id IS NOT NULL
  ), gone AS (
    DELETE FROM public.files f
     USING owned o
     WHERE f.id = o.fid
       AND f.owner_business_id = o.seller_id
       AND f.purpose = 'import'
    RETURNING o.job_id, o.seller_id, f.object_key
  )
  SELECT r.job_id, r.seller_id, g.object_key
    FROM removed r
    LEFT JOIN gone g ON g.job_id = r.job_id
   ORDER BY r.job_id, g.object_key;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "import_jobs_expire"(timestamptz, timestamptz, integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "import_jobs_expire"(timestamptz, timestamptz, integer) TO app_user;
--> statement-breakpoint
-- K10: `p_cutoff`'tan önce güncellenmiş `uploaded`/`validating`/`applying` işler (en çok `p_limit`)
-- `failed` + `TIMED_OUT` olur; `applied_until_row` korunur (uygulanmış partiler kalır, SF-08).
-- Düşürülen iş kimlikleri döner (kişisel veri yok).
CREATE FUNCTION "import_jobs_time_out"(p_cutoff timestamptz, p_limit integer)
  RETURNS TABLE (job_id uuid)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  IF nullif(current_setting('app.business_id', true), '') IS NOT NULL
     OR nullif(current_setting('app.user_id', true), '') IS NOT NULL
     OR coalesce(nullif(current_setting('app.is_platform', true), ''), 'false') = 'true' THEN
    RAISE EXCEPTION 'import_jobs_time_out: yalnız bağlamsız sistem işi' USING ERRCODE = '42501';
  END IF;
  IF p_cutoff IS NULL OR p_cutoff > now() OR p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'import_jobs_time_out: geçersiz parametre' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH due AS (
    SELECT j.id
      FROM public.import_jobs j
     WHERE j.status IN ('uploaded', 'validating', 'applying')
       AND j.updated_at < p_cutoff
     ORDER BY j.updated_at, j.id
     LIMIT p_limit
  )
  UPDATE public.import_jobs j
     SET status = 'failed', failure_code = 'TIMED_OUT', updated_at = now()
    FROM due
   WHERE j.id = due.id
     AND j.status IN ('uploaded', 'validating', 'applying')
  RETURNING j.id;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "import_jobs_time_out"(timestamptz, integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "import_jobs_time_out"(timestamptz, integer) TO app_user;
