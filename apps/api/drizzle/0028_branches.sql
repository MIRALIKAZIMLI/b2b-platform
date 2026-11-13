-- F2.5 şubeler (US-010): eşik yalnız `above_amount`ta ve > 0 (T4, T5); konum iki koordinatla birlikte,
-- aralık içinde (T6). Var olan satırlar uyumlu: kayıtta açılan şube `every_order`, eşik ve konum boş.
ALTER TABLE "branches" ADD CONSTRAINT "branches_approval_threshold_only_above_check" CHECK ("branches"."approval_rule" = 'above_amount' or "branches"."approval_threshold" is null);--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_approval_threshold_positive_check" CHECK ("branches"."approval_threshold" is null or "branches"."approval_threshold" > 0);--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_geo_pair_check" CHECK (("branches"."geo_lat" is null) = ("branches"."geo_lng" is null));--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_geo_range_check" CHECK (("branches"."geo_lat" is null or "branches"."geo_lat" between -90 and 90) and ("branches"."geo_lng" is null or "branches"."geo_lng" between -180 and 180));