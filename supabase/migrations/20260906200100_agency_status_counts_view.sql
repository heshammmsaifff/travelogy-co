-- ============================================================================
-- Phase 2 — aggregate the agency status counts in Postgres
--
-- The filter chips on the agencies screen need a count per status. Selecting
-- every row and counting in JavaScript would break CLAUDE.md §11 ("push
-- filtering/sorting/aggregation into Postgres instead of pulling rows into JS")
-- and would get slower with every agency added.
--
-- `security_invoker = on` is essential: without it the view would execute with
-- its owner's privileges and leak counts of agencies the caller cannot see.
-- With it, the view honours the RLS policies on `agencies` for each caller —
-- so an agent sees only their own company here, and staff with `agencies.view`
-- see everything.
-- ============================================================================

create view public.agency_status_counts
with (security_invoker = on)
as
select status, count(*)::bigint as count
from public.agencies
group by status;

comment on view public.agency_status_counts is
  'Per-status agency counts for the back-office filter chips. Honours the caller RLS via security_invoker.';

grant select on public.agency_status_counts to authenticated;
