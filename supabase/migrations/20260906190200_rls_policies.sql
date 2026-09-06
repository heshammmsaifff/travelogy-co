-- ============================================================================
-- Phase 1 — Row Level Security policies
--
-- Every policy resolves access through has_permission() / helper functions,
-- never by comparing a role name (CLAUDE.md §7 rule 1).
--
-- Reading guide: for each table, "who may read" then "who may write". Where a
-- policy grants write access to a user's own row, a trigger in the functions
-- migration constrains *which columns* they can actually change — RLS grants
-- access to rows, not to columns.
-- ============================================================================

-- ============================================================================
-- roles
-- ============================================================================

-- Any signed-in user may read the role catalogue: the UI needs role names, and
-- the list of role names is not sensitive.
create policy roles_select_authenticated
  on public.roles for select
  to authenticated
  using (true);

create policy roles_insert_with_permission
  on public.roles for insert
  to authenticated
  with check (public.authorize('settings.roles.manage'));

create policy roles_update_with_permission
  on public.roles for update
  to authenticated
  using (public.authorize('settings.roles.manage'))
  with check (public.authorize('settings.roles.manage'));

create policy roles_delete_with_permission
  on public.roles for delete
  to authenticated
  using (public.authorize('settings.roles.manage'));

-- ============================================================================
-- permissions
-- ============================================================================

-- Readable so the role builder can render the registry. Intentionally has NO
-- insert/update/delete policy: the registry is seeded and extended by
-- migration only, so it cannot be grown at runtime (CLAUDE.md §7).
create policy permissions_select_authenticated
  on public.permissions for select
  to authenticated
  using (true);

-- ============================================================================
-- role_permissions
-- ============================================================================

-- You can see the grants of your own role (so the UI can reason about what you
-- may do), and role managers can see all of them.
create policy role_permissions_select
  on public.role_permissions for select
  to authenticated
  using (
    role_id = public.current_role_id()
    or public.authorize('settings.roles.manage')
  );

create policy role_permissions_insert
  on public.role_permissions for insert
  to authenticated
  with check (public.authorize('settings.roles.manage'));

create policy role_permissions_delete
  on public.role_permissions for delete
  to authenticated
  using (public.authorize('settings.roles.manage'));

-- ============================================================================
-- agencies
-- ============================================================================

create policy agencies_select_own_or_with_permission
  on public.agencies for select
  to authenticated
  using (
    -- An agent sees their own company.
    id = public.current_agency_id()
    -- Back-office staff with the permission see every company.
    or public.authorize('agencies.view')
  );

-- Agencies are created by the signup trigger (SECURITY DEFINER) or by an admin
-- through a privileged server-side path, never by a client INSERT.
create policy agencies_insert_with_permission
  on public.agencies for insert
  to authenticated
  with check (public.authorize('agencies.create'));

create policy agencies_update
  on public.agencies for update
  to authenticated
  using (
    -- The owner may maintain their own company profile...
    (id = public.current_agency_id() and public.is_active_user())
    or public.authorize('agencies.update')
  )
  with check (
    (id = public.current_agency_id() and public.is_active_user())
    or public.authorize('agencies.update')
  );

-- No delete policy. Agencies are suspended, never deleted — a booking history
-- must not be able to lose the company it belongs to.

-- ============================================================================
-- profiles
-- ============================================================================

create policy profiles_select
  on public.profiles for select
  to authenticated
  using (
    -- Always your own row, whatever your status — a pending user must be able
    -- to load their own profile to see the "awaiting approval" screen.
    id = auth.uid()
    -- An agent owner sees the sub-users of their own company.
    or (
      agency_id is not null
      and agency_id = public.current_agency_id()
      and public.is_active_user()
    )
    -- Back-office staff with the right permission.
    or public.authorize('agencies.view')
    or public.authorize('staff.view')
  );

-- Profiles are created by the signup trigger, or by an admin invite flow that
-- runs server-side with the service role.
create policy profiles_insert_with_permission
  on public.profiles for insert
  to authenticated
  with check (public.authorize('staff.create'));

create policy profiles_update
  on public.profiles for update
  to authenticated
  using (
    -- Your own row. The escalation trigger stops you touching role/status/agency.
    id = auth.uid()
    -- An agent owner manages their own sub-users.
    or (
      agency_id is not null
      and agency_id = public.current_agency_id()
      and public.authorize('agency_users.manage')
    )
    or public.authorize('staff.update')
    or public.authorize('agencies.approve')
  )
  with check (
    id = auth.uid()
    or (
      agency_id is not null
      and agency_id = public.current_agency_id()
      and public.authorize('agency_users.manage')
    )
    or public.authorize('staff.update')
    or public.authorize('agencies.approve')
  );

-- No delete policy: accounts are suspended, not deleted, so bookings and audit
-- rows keep pointing at a real person.

-- ============================================================================
-- audit_log
-- ============================================================================

create policy audit_log_select_with_permission
  on public.audit_log for select
  to authenticated
  using (public.authorize('audit.view'));

-- Deliberately no insert/update/delete policy for clients. Rows are written
-- only by SECURITY DEFINER functions (public.write_audit). An audit log a user
-- can write to directly, or edit afterwards, is not evidence of anything.
