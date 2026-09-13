-- ============================================================================
-- Temporary passwords, enforced by the DATABASE, not only by the layouts
--
-- An account created by someone else — staff (back-office), a driver (fleet),
-- an agency member (their owner or the back-office) — starts on a temporary
-- password the creator saw, with `profiles.must_change_password = true`.
-- Until now that flag was honoured only by page layouts (§15, 3.4, 16.x, 23.x),
-- which left two doors open:
--
--   1. A flagged user could act directly against PostgREST and the RPCs —
--      read agency data, search, book — before their password was private.
--   2. WORSE: `profiles_update` lets a user update their own row, and the
--      profile guard never looked at this column, so a flagged user could
--      simply set `must_change_password = false` without changing anything.
--      The verification run for 23.x even asserted that this worked; it was
--      checking the app's own clearing step and proved the bypass instead.
--
-- The fix follows §15 (3.1): teach the two resolvers every policy and RPC
-- already goes through, so everything inherits the rule at once, and make the
-- flag something only the system can clear — at the moment the password
-- genuinely changes.
--
-- Deliberately NOT gated, and why:
--   - `current_agency_id()`, `current_role_id()`, `can_read_own_agency()`:
--     read-only helpers. A flagged user must still load their own profile,
--     role and agency to be shown the change-password screen — exactly as a
--     pending user must be shown the pending screen. Every policy that grants
--     real data pairs them with `is_active_user()` or `authorize()`.
--   - Reference tables readable by any signed-in user (meal plans,
--     currencies, tax rates, roles, permissions, public CMS content).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The resolvers: a flagged account is not yet an active actor
-- ----------------------------------------------------------------------------

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    left join public.agencies a on a.id = p.agency_id
    where p.id = auth.uid()
      and p.status = 'active'
      -- Back-office staff have no agency; agents inherit their company's state.
      and (p.agency_id is null or a.status = 'active')
      -- Still on a password someone else has seen: not yet allowed to act.
      and not p.must_change_password
  );
$$;

create or replace function public.has_permission(p_user_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    join public.roles r on r.id = p.role_id
    left join public.agencies a on a.id = p.agency_id
    where p.id = p_user_id
      and p.status = 'active'
      and (p.agency_id is null or a.status = 'active')
      -- A flagged account holds no permissions, super_admin role included.
      and not p.must_change_password
      and (
        r.key = 'super_admin'
        or exists (
          select 1
          from public.role_permissions rp
          where rp.role_id = r.id
            and rp.permission_key = p_permission
        )
      )
  );
$$;

-- ----------------------------------------------------------------------------
-- 2. The two "own row" policies that did not go through a resolver
--
-- A driver reads their own `drivers` row and their own assignments by
-- `profile_id = auth.uid()` alone — so a flagged driver (and, as it happens,
-- a suspended one) could read their job list directly. `is_active_user()` is
-- one of the four functions a policy may call (§15, Phase 4 standing rule).
-- ----------------------------------------------------------------------------

drop policy if exists drivers_self_read on public.drivers;
create policy drivers_self_read
  on public.drivers for select
  to authenticated
  using (profile_id = auth.uid() and public.is_active_user());

drop policy if exists driver_assignments_self_read on public.driver_assignments;
create policy driver_assignments_self_read
  on public.driver_assignments for select
  to authenticated
  using (
    public.is_active_user()
    and exists (
      select 1 from public.drivers d
      where d.id = driver_assignments.driver_id
        and d.profile_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- 3. Only the system may move the flag
--
-- The body is the live `prevent_profile_privilege_escalation()` unchanged,
-- with one rule added right after the system-context escape: no signed-in
-- user — the account holder, their agency owner, or a super admin — may change
-- `must_change_password` through PostgREST. It is set by the service-role
-- use-cases that create accounts, and cleared by the trigger in section 4.
-- ----------------------------------------------------------------------------

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
  -- Migrations, seeds and privileged server-side use-cases. `auth.uid() is
  -- null` covers the SQL editor and Postgres itself (§15, 5.x standing rule).
  if auth.role() = 'service_role' or v_actor is null then
    return new;
  end if;

  -- Before the super-admin short-circuit on purpose: clearing this flag by
  -- hand is exactly the bypass it exists to prevent, whoever does it.
  if new.must_change_password is distinct from old.must_change_password then
    raise exception 'The temporary-password flag is managed by the system: it clears when the password is changed.'
      using errcode = '42501';
  end if;

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

    if v_new_role_key = 'super_admin' then
      raise exception 'Only a super admin can grant the super admin role.' using errcode = '42501';
    end if;

    -- Taking a role AWAY from a driver is as sensitive as giving one, so the
    -- old scope is checked before the new one.
    if v_old_role_scope = 'driver' and not public.has_permission(v_actor, 'drivers.manage') then
      raise exception 'You do not have permission to change a driver account.' using errcode = '42501';
    end if;

    if v_new_role_scope = 'admin' then
      if not public.has_permission(v_actor, 'staff.update') then
        raise exception 'You do not have permission to assign back-office roles.' using errcode = '42501';
      end if;

    elsif v_new_role_scope = 'driver' then
      if v_old_role_scope = 'admin' then
        raise exception 'You cannot change the role of a back-office user.' using errcode = '42501';
      end if;
      if not public.has_permission(v_actor, 'drivers.manage') then
        raise exception 'You do not have permission to assign the driver role.' using errcode = '42501';
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

    -- BEFORE the agency clauses: without this a role holding `agencies.approve`
    -- could suspend or reinstate any driver, which is not what that key means.
    elsif v_old_role_scope = 'driver' then
      if not public.has_permission(v_actor, 'drivers.manage') then
        raise exception 'You do not have permission to change a driver account status.'
          using errcode = '42501';
      end if;

    elsif public.has_permission(v_actor, 'agencies.approve')
       or public.has_permission(v_actor, 'agencies.suspend') then
      null;  -- back-office approver acting on an agent account
    elsif public.has_permission(v_actor, 'agency_users.manage')
      and old.agency_id is not null
      and old.agency_id = public.current_agency_id()
      and new.status in ('active', 'suspended') then
      null;
    else
      raise exception 'You do not have permission to change this account status.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. The flag clears when — and only when — the password really changes
--
-- Fires on any genuine change to the stored password hash, whichever path made
-- it: the forced change-password screen, or the email recovery flow (which is
-- also a legitimate way to end up with a password only you know). Account
-- creation INSERTs the row, so it never fires there, and the creating
-- use-case sets the flag afterwards.
--
-- Runs inside Supabase Auth's own connection, where no JWT claims are set, so
-- `auth.uid()` is null and the profile guard treats it as the system.
-- ----------------------------------------------------------------------------

create or replace function public.clear_temporary_password_flag()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.profiles
     set must_change_password = false
   where id = new.id
     and must_change_password;
  return new;
end;
$$;

revoke all on function public.clear_temporary_password_flag() from public, anon, authenticated;

drop trigger if exists on_auth_user_password_changed on auth.users;
create trigger on_auth_user_password_changed
  after update of encrypted_password on auth.users
  for each row
  when (old.encrypted_password is distinct from new.encrypted_password)
  execute function public.clear_temporary_password_flag();
