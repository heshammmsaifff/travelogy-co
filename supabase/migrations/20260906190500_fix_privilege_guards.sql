-- ============================================================================
-- Phase 1 — fix two privilege holes found by the verification suite
--
-- Both came from the same mistake: RLS grants access to *rows*, not to
-- *columns*. A policy that says "you may update your own agency" also says
-- "you may update every column of it", which is almost never what was meant.
--
-- Hole 1 (privilege escalation, serious). The profile guard only checked
--   `auth.uid() = new.id`, so it protected a user from editing themselves but
--   not from editing someone else. An agency owner holding
--   `agency_users.manage` could set one of their own sub-users' role_id to
--   super_admin and then sign in as them. Verified exploitable before fixing.
--
-- Hole 2 (financial). `agencies_update` let an agency owner maintain their own
--   company profile — and therefore also set their own credit_limit and flip
--   their own status to active. Verified: an owner raised their limit to
--   999,999 with no error.
--
-- Hole 3 (data exposure, minor). `agencies_select` resolved the caller's
--   agency without checking that the caller is active, so a suspended or
--   still-pending user kept read access to their company row.
-- ============================================================================

-- ============================================================================
-- 1. Suspended and pending users lose read access to their agency
-- ============================================================================

drop policy if exists agencies_select_own_or_with_permission on public.agencies;

create policy agencies_select_own_or_with_permission
  on public.agencies for select
  to authenticated
  using (
    -- An *active* agent sees their own company. Suspension is meant to cut off
    -- access; without is_active_user() it only cut off writes.
    (id = public.current_agency_id() and public.is_active_user())
    or public.authorize('agencies.view')
  );

-- ============================================================================
-- 2. Column-level guard for agencies
--
-- The owner may maintain their company's descriptive fields. Everything that
-- represents a decision the *business* made about them — their credit, their
-- status, their reference code, their approval trail — is off limits.
-- ============================================================================

create or replace function public.prevent_agency_privileged_field_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() = 'service_role' or public.is_super_admin() then
    return new;
  end if;

  if new.code is distinct from old.code then
    raise exception 'The agency reference code cannot be changed.' using errcode = '42501';
  end if;

  if new.credit_limit is distinct from old.credit_limit
     and not public.has_permission(auth.uid(), 'agencies.credit_limit.update') then
    raise exception 'You do not have permission to change the credit limit.' using errcode = '42501';
  end if;

  if new.currency_code is distinct from old.currency_code
     and not public.has_permission(auth.uid(), 'agencies.update') then
    raise exception 'You do not have permission to change the agency currency.' using errcode = '42501';
  end if;

  if new.status is distinct from old.status
     and not (
       public.has_permission(auth.uid(), 'agencies.approve')
       or public.has_permission(auth.uid(), 'agencies.suspend')
     ) then
    raise exception 'You do not have permission to change the agency status.' using errcode = '42501';
  end if;

  if (new.approved_at      is distinct from old.approved_at
      or new.approved_by   is distinct from old.approved_by
      or new.rejected_at   is distinct from old.rejected_at
      or new.rejected_by   is distinct from old.rejected_by
      or new.rejection_reason is distinct from old.rejection_reason)
     and not public.has_permission(auth.uid(), 'agencies.approve') then
    raise exception 'You do not have permission to change the approval record.' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_agency_privileged_field_change() from public, anon, authenticated;

create trigger agencies_prevent_privileged_field_change
  before update on public.agencies
  for each row execute function public.prevent_agency_privileged_field_change();

-- ============================================================================
-- 3. Profile guard, rewritten to cover every row rather than only your own
--
-- The rules, in one place:
--   role_id   — never your own; never super_admin unless you are one;
--               admin-scope roles need staff.update; agent-scope roles need
--               agency_users.manage *and* the target must be in your agency.
--   status    — never your own; staff accounts need staff.update; agent
--               accounts need an approver permission, or agency_users.manage
--               for your own sub-users (active/suspended only).
--   agency_id — super admin only. Moving a person between companies moves
--               every row they can see.
--   email     — owned by Supabase Auth and synced by trigger.
-- ============================================================================

create or replace function public.prevent_profile_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor          uuid := auth.uid();
  v_new_role_key   text;
  v_new_role_scope public.role_scope;
  v_old_role_scope public.role_scope;
begin
  -- Migrations, seeds and privileged server-side use-cases.
  if auth.role() = 'service_role' then
    return new;
  end if;

  -- A super admin may do all of this; it is the role that manages the others.
  if public.is_super_admin(v_actor) then
    return new;
  end if;

  if new.email is distinct from old.email then
    raise exception 'Email is managed by the authentication system.' using errcode = '42501';
  end if;

  if new.agency_id is distinct from old.agency_id then
    raise exception 'Only a super admin can move a user between agencies.' using errcode = '42501';
  end if;

  select scope into v_old_role_scope from public.roles where id = old.role_id;

  -- ---------------------------------------------------------------- role_id
  if new.role_id is distinct from old.role_id then
    if v_actor = new.id then
      raise exception 'You cannot change your own role.' using errcode = '42501';
    end if;

    select key, scope into v_new_role_key, v_new_role_scope
    from public.roles where id = new.role_id;

    -- Only a super admin can mint another super admin. Without this, anyone
    -- holding staff.update could promote a colleague and inherit their access.
    if v_new_role_key = 'super_admin' then
      raise exception 'Only a super admin can grant the super admin role.' using errcode = '42501';
    end if;

    if v_new_role_scope = 'admin' then
      if not public.has_permission(v_actor, 'staff.update') then
        raise exception 'You do not have permission to assign back-office roles.' using errcode = '42501';
      end if;
    else
      -- Agent-scope role: only an agency user manager, only inside their own
      -- agency, and never against a back-office account.
      if v_old_role_scope = 'admin' then
        raise exception 'You cannot change the role of a back-office user.' using errcode = '42501';
      end if;

      if not public.has_permission(v_actor, 'agency_users.manage')
         or old.agency_id is null
         or old.agency_id is distinct from public.current_agency_id() then
        raise exception 'You do not have permission to assign this role.' using errcode = '42501';
      end if;
    end if;
  end if;

  -- ----------------------------------------------------------------- status
  if new.status is distinct from old.status then
    if v_actor = new.id then
      raise exception 'You cannot change your own account status.' using errcode = '42501';
    end if;

    if v_old_role_scope = 'admin' then
      if not public.has_permission(v_actor, 'staff.update') then
        raise exception 'You do not have permission to change a staff account status.'
          using errcode = '42501';
      end if;
    elsif public.has_permission(v_actor, 'agencies.approve')
       or public.has_permission(v_actor, 'agencies.suspend') then
      null;  -- back-office approver acting on an agent account
    elsif public.has_permission(v_actor, 'agency_users.manage')
      and old.agency_id is not null
      and old.agency_id = public.current_agency_id()
      and new.status in ('active', 'suspended') then
      -- An agency owner may enable or disable their own sub-users, but cannot
      -- move anyone into `pending` or `rejected`: those are approval states
      -- that belong to the back-office.
      null;
    else
      raise exception 'You do not have permission to change this account status.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_profile_privilege_escalation() from public, anon, authenticated;
