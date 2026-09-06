-- ============================================================================
-- Phase 1 — let a *pending* agent see the agency they just registered
--
-- 20260906190500 tightened agencies_select to active users only, in order to
-- cut off suspended accounts. That was right for suspension but too broad: it
-- also hid the company from an applicant who is still waiting for approval, so
-- the "awaiting approval" screen could not show them the name and reference of
-- the registration they had just submitted.
--
-- Correct rule: `suspended` and `rejected` lose access; `pending` keeps read
-- access to its own row, because that data is the applicant's own submission.
-- ============================================================================

create or replace function public.can_read_own_agency()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and status in ('pending', 'active')
  );
$$;

revoke all on function public.can_read_own_agency() from public, anon, authenticated;
-- Evaluated inside a policy as the calling user, so `authenticated` needs it.
grant execute on function public.can_read_own_agency() to authenticated;

drop policy if exists agencies_select_own_or_with_permission on public.agencies;

create policy agencies_select_own_or_with_permission
  on public.agencies for select
  to authenticated
  using (
    (id = public.current_agency_id() and public.can_read_own_agency())
    or public.authorize('agencies.view')
  );

-- Writing remains active-only: agencies_update still requires is_active_user(),
-- so a pending applicant can read their submission but not edit it while it is
-- under review.
