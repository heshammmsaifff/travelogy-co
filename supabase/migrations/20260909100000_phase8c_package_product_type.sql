-- ============================================================================
-- Phase 8c — the third product type: package
--
-- Alone in its own migration for the reason 8b's `driver` scope was: Postgres
-- will not let a new enum value be USED in the transaction that added it, and
-- the Supabase CLI runs one migration per transaction (§15, 16.3).
-- ============================================================================

alter type public.product_type add value if not exists 'package';
