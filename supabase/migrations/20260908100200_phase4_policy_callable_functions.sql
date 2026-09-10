-- ============================================================================
-- Phase 4 — fix: policies must only call functions the caller may execute
--
-- Found by the Phase 4 verification suite, and it would have been invisible
-- from reading the policies.
--
-- Phase 1's function hardening (20260906190400) revoked EXECUTE from
-- `authenticated` on every SECURITY DEFINER function except the four that RLS
-- evaluates AS THE CALLER: authorize(), current_agency_id(), current_role_id()
-- and is_active_user(). The Phase 4 policies were written against
-- has_permission() and is_super_admin(), neither of which is in that set.
--
-- The symptom was misleading in both directions:
--
--   * The agent-denial tests "passed", but for the wrong reason — the agent was
--     stopped by `permission denied for function has_permission`, not by the
--     policy deciding no. A test can pass on an error and hide a real defect.
--   * A staff member who genuinely HELD cms.content.publish would have hit the
--     same error and been unable to manage banners at all. That bug would not
--     have surfaced until Phase 6 built the editor.
--   * Inserting a quotation failed outright, because the `.select()` that
--     follows an insert re-evaluates the SELECT policy, which called
--     is_super_admin().
--
-- `authorize(key)` is exactly `has_permission(auth.uid(), key)` and IS callable
-- by authenticated, so it is the correct spelling inside a policy.
--
-- Standing rule this produces: a policy may only call authorize(),
-- current_agency_id(), current_role_id() or is_active_user(). Any other
-- SECURITY DEFINER helper will fail for the very users the policy is meant to
-- serve.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Banners
-- ----------------------------------------------------------------------------

drop policy banners_manager_read on public.banners;
drop policy banners_write       on public.banners;
drop policy banners_update      on public.banners;
drop policy banners_delete      on public.banners;

create policy banners_manager_read
  on public.banners for select
  to authenticated
  using (public.authorize('cms.content.publish'));

create policy banners_write
  on public.banners for insert
  to authenticated
  with check (public.authorize('cms.content.publish'));

create policy banners_update
  on public.banners for update
  to authenticated
  using (public.authorize('cms.content.publish'))
  with check (public.authorize('cms.content.publish'));

create policy banners_delete
  on public.banners for delete
  to authenticated
  using (public.authorize('cms.content.publish'));

-- ----------------------------------------------------------------------------
-- 2. Content pages
-- ----------------------------------------------------------------------------

drop policy content_pages_update on public.content_pages;

create policy content_pages_update
  on public.content_pages for update
  to authenticated
  using (public.authorize('cms.content.publish'))
  with check (public.authorize('cms.content.publish'));

-- ----------------------------------------------------------------------------
-- 3. Quotations
--
-- The super-admin clause is dropped rather than rewritten. There is no
-- permission key for reading another company's quotations, and inventing one
-- here would put a back-office capability into the phase that builds the agent
-- portal. Quotations are agency-scoped, full stop; if the back-office ever
-- needs to see them, that arrives with its own permission key and its own
-- screen.
-- ----------------------------------------------------------------------------

drop policy quotations_read      on public.quotations;
drop policy quotation_items_read on public.quotation_items;

create policy quotations_read
  on public.quotations for select
  to authenticated
  using (agency_id = public.current_agency_id() and public.is_active_user());

create policy quotation_items_read
  on public.quotation_items for select
  to authenticated
  using (
    exists (
      select 1 from public.quotations q
      where q.id = quotation_id
        and q.agency_id = public.current_agency_id()
        and public.is_active_user()
    )
  );
