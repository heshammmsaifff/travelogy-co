-- ============================================================================
-- Fix: bootstrap_super_admin() failed when run from the SQL editor
--
-- Symptom, running the documented first-run step:
--     select public.bootstrap_super_admin('someone@example.com');
--     ERROR 42501: Only a super admin can move a user between agencies.
--     CONTEXT: prevent_profile_privilege_escalation() line 23
--
-- Cause: the profile guard's system-context escape hatch tested only
--     auth.role() = 'service_role'
-- but in the SQL editor the session is `postgres` with no JWT at all, so
-- auth.role() is NULL and auth.uid() is NULL. The guard therefore fell through
-- to its ordinary rules — and since bootstrap runs precisely when no super
-- admin exists yet, there was nobody who could satisfy them. The function was
-- unusable by the exact route it was written for.
--
-- It went unnoticed because every test called it through a service-role
-- client, where auth.role() *is* 'service_role'. The documented path — the
-- Supabase SQL editor — was never the one exercised.
--
-- The same class of bug was fixed for the agencies guard in
-- 20260906200200; this brings the profiles guard in line. Every guard that
-- has a system-context escape now treats "no authenticated user" as that
-- context, which is safe because every RLS policy on these tables is scoped
-- `to authenticated` — an anonymous request cannot reach an UPDATE at all, so
-- a NULL auth.uid() here means Postgres itself, a migration, the service role,
-- or the SQL editor.
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
  -- System contexts: the service role, migrations, referential-integrity
  -- cascades issued by Postgres, and the SQL editor.
  if auth.role() = 'service_role' or v_actor is null then
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

-- ----------------------------------------------------------------------------
-- Also: the bootstrap left the promoted user's old agency behind.
--
-- A self-registered account arrives as agent_owner with an agency created by
-- the signup trigger. Promoting it to super_admin sets agency_id = null, which
-- orphaned that agency as a permanently `pending` registration nobody would
-- ever approve. Clean it up as part of the promotion.
-- ----------------------------------------------------------------------------

create or replace function public.bootstrap_super_admin(p_email text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role_id   uuid;
  v_user_id   uuid;
  v_agency_id uuid;
  v_count     integer;
begin
  select id into v_role_id from public.roles where key = 'super_admin';

  select count(*) into v_count
  from public.profiles
  where role_id = v_role_id and status = 'active';

  if v_count > 0 then
    raise exception
      'A super admin already exists. Use the back-office to manage roles.'
      using errcode = '42501';
  end if;

  select id, agency_id into v_user_id, v_agency_id
  from public.profiles
  where lower(email) = lower(btrim(p_email));

  if v_user_id is null then
    raise exception 'No account found for %. Sign up first, then run this.', p_email;
  end if;

  update public.profiles
  set role_id     = v_role_id,
      status      = 'active',
      agency_id   = null,   -- back-office staff belong to no agency
      approved_at = now()
  where id = v_user_id;

  -- Remove the agency the signup trigger created for this account, but only if
  -- promoting the user left it with no members at all.
  if v_agency_id is not null
     and not exists (select 1 from public.profiles where agency_id = v_agency_id) then
    delete from public.agencies where id = v_agency_id;
  end if;

  insert into public.audit_log (actor_id, actor_email, action, entity_type, entity_id, changes)
  values (v_user_id, p_email, 'bootstrap_super_admin', 'profile', v_user_id::text,
          jsonb_build_object('role', 'super_admin'));

  return 'Promoted ' || p_email || ' to super_admin.';
end;
$$;

revoke all on function public.bootstrap_super_admin(text) from public, anon, authenticated;
