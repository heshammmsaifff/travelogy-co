-- ============================================================================
-- Phase 8b — a third role scope: driver
--
-- This migration does ONE thing: it adds the enum value. Postgres will not let
-- a new enum value be USED in the same transaction that added it, and the
-- Supabase CLI runs each migration file in its own transaction — so the role,
-- the permissions and the tables that reference `driver` all live in the next
-- file. Splitting them is not tidiness, it is the only order that works.
--
-- WHY a third scope rather than reusing `agent` (CLAUDE.md §7):
-- a scope answers "which side of the product is this person on", and it is
-- what `landingPathFor()` and the route-group layouts read. A driver is on
-- neither side: they belong to no agency, must never see a price, and their
-- entire surface is a list of jobs. Reusing `agent` would have put them inside
-- an agency's RLS scope, which is exactly wrong.
-- ============================================================================

alter type public.role_scope add value if not exists 'driver';
