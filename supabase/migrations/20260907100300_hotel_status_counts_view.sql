-- ============================================================================
-- Phase 3a — per-status hotel counts for the back-office filter chips
--
-- Same shape and same reasoning as agency_status_counts: aggregate in Postgres
-- rather than counting rows in JavaScript (CLAUDE.md §11), and
-- `security_invoker = on` so the view honours the caller's RLS instead of
-- running with its owner's privileges and leaking counts of hotels they
-- cannot see.
-- ============================================================================

create view public.hotel_status_counts
with (security_invoker = on)
as
select status, count(*)::bigint as count
from public.hotels
group by status;

comment on view public.hotel_status_counts is
  'Per-status hotel counts. Honours caller RLS via security_invoker.';

grant select on public.hotel_status_counts to authenticated;
