-- ============================================================================
-- Phase 2 — back-office operations, agency lifecycle and the audit trail
--
-- Three things:
--   1. An agency's status now gates its users' access, not just its own row.
--   2. Audit triggers, so every role, permission, status and credit change is
--      recorded by the database rather than by whoever remembered to log it.
--   3. Atomic RPCs for the agency lifecycle, because approving an agency has
--      to move the company AND its owner in one step.
--
-- CLAUDE.md §7 (rule 4: permission changes are audited), §10, §12.
-- ============================================================================

-- ============================================================================
-- 1. A suspended agency locks out its users
--
-- Phase 1 tracked profile status and agency status independently, so an active
-- owner of a suspended agency could still sign in and use the portal. Access
-- now requires BOTH to be active. Making this a property of the two resolver
-- functions means every RLS policy inherits it at once.
-- ============================================================================

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

-- ============================================================================
-- 2. Forced password change
--
-- Staff accounts are created by an admin with a temporary password (see §15),
-- so the account must not stay usable on a password someone else has seen.
-- ============================================================================

alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

comment on column public.profiles.must_change_password is
  'Set when an admin creates the account with a temporary password. The admin layout redirects to the change-password screen until it is cleared.';

-- The user clears this themselves by setting a new password, so it is exempt
-- from the "cannot edit your own privileged fields" rule — it grants nothing.

-- ============================================================================
-- 3. Audit triggers
--
-- Triggers rather than application calls: a use-case can forget to log, and a
-- direct SQL edit would leave no trace at all. CLAUDE.md §7 rule 4.
-- ============================================================================

create or replace function public.audit_role_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit('role.created', 'role', new.id::text,
      jsonb_build_object('key', new.key, 'scope', new.scope, 'name_en', new.name_en));
  elsif tg_op = 'DELETE' then
    perform public.write_audit('role.deleted', 'role', old.id::text,
      jsonb_build_object('key', old.key, 'name_en', old.name_en));
  else
    -- Only record an update that actually changed something meaningful.
    if new.name_ar is distinct from old.name_ar
       or new.name_en is distinct from old.name_en
       or new.description_ar is distinct from old.description_ar
       or new.description_en is distinct from old.description_en then
      perform public.write_audit('role.updated', 'role', new.id::text,
        jsonb_build_object('key', new.key, 'from', old.name_en, 'to', new.name_en));
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger roles_audit
  after insert or update or delete on public.roles
  for each row execute function public.audit_role_change();

create or replace function public.audit_permission_grant()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role_key text;
begin
  select key into v_role_key from public.roles where id = coalesce(new.role_id, old.role_id);

  if tg_op = 'INSERT' then
    perform public.write_audit('permission.granted', 'role', new.role_id::text,
      jsonb_build_object('role', v_role_key, 'permission', new.permission_key));
  else
    perform public.write_audit('permission.revoked', 'role', old.role_id::text,
      jsonb_build_object('role', v_role_key, 'permission', old.permission_key));
  end if;

  return coalesce(new, old);
end;
$$;

create trigger role_permissions_audit
  after insert or delete on public.role_permissions
  for each row execute function public.audit_permission_grant();

create or replace function public.audit_profile_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old_role text;
  v_new_role text;
begin
  if new.status is distinct from old.status then
    perform public.write_audit('profile.status_changed', 'profile', new.id::text,
      jsonb_build_object('email', new.email, 'from', old.status, 'to', new.status));
  end if;

  if new.role_id is distinct from old.role_id then
    select key into v_old_role from public.roles where id = old.role_id;
    select key into v_new_role from public.roles where id = new.role_id;
    perform public.write_audit('profile.role_changed', 'profile', new.id::text,
      jsonb_build_object('email', new.email, 'from', v_old_role, 'to', v_new_role));
  end if;

  return new;
end;
$$;

create trigger profiles_audit
  after update on public.profiles
  for each row execute function public.audit_profile_change();

create or replace function public.audit_agency_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from old.status then
    perform public.write_audit('agency.status_changed', 'agency', new.id::text,
      jsonb_build_object('code', new.code, 'name', new.name, 'from', old.status, 'to', new.status));
  end if;

  if new.credit_limit is distinct from old.credit_limit then
    perform public.write_audit('agency.credit_limit_changed', 'agency', new.id::text,
      jsonb_build_object('code', new.code, 'from', old.credit_limit, 'to', new.credit_limit));
  end if;

  return new;
end;
$$;

create trigger agencies_audit
  after update on public.agencies
  for each row execute function public.audit_agency_change();

-- ============================================================================
-- 4. Agency lifecycle RPCs
--
-- Approving an agency has to activate the company AND its pending owner. Two
-- separate statements from the client could half-succeed and leave an approved
-- company nobody can sign in to, so both happen in one transaction here.
--
-- Each function re-checks the permission itself. That is not redundant with
-- the application-layer check in the Server Action: SECURITY DEFINER runs as
-- the owner, so without this check the function would be an open door for
-- anyone who could reach the RPC (CLAUDE.md §12).
-- ============================================================================

create or replace function public.approve_agency(p_agency_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission(auth.uid(), 'agencies.approve') then
    raise exception 'You do not have permission to approve agencies.' using errcode = '42501';
  end if;

  update public.agencies
  set status           = 'active',
      approved_at      = now(),
      approved_by      = auth.uid(),
      rejected_at      = null,
      rejected_by      = null,
      rejection_reason = null
  where id = p_agency_id;

  if not found then
    raise exception 'Agency not found.' using errcode = 'P0002';
  end if;

  -- Only pending members are activated. Someone suspended individually stays
  -- suspended — approving the company is not a blanket reinstatement.
  update public.profiles
  set status      = 'active',
      approved_at = now(),
      approved_by = auth.uid()
  where agency_id = p_agency_id
    and status = 'pending';
end;
$$;

create or replace function public.reject_agency(p_agency_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission(auth.uid(), 'agencies.approve') then
    raise exception 'You do not have permission to reject agencies.' using errcode = '42501';
  end if;

  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'A rejection reason is required.' using errcode = '22023';
  end if;

  update public.agencies
  set status           = 'rejected',
      rejected_at      = now(),
      rejected_by      = auth.uid(),
      rejection_reason = btrim(p_reason)
  where id = p_agency_id;

  if not found then
    raise exception 'Agency not found.' using errcode = 'P0002';
  end if;

  update public.profiles
  set status = 'rejected'
  where agency_id = p_agency_id
    and status = 'pending';
end;
$$;

create or replace function public.set_agency_status(p_agency_id uuid, p_status public.agency_status)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_permission(auth.uid(), 'agencies.suspend') then
    raise exception 'You do not have permission to change an agency status.' using errcode = '42501';
  end if;

  -- Approval and rejection carry extra bookkeeping, so they have their own
  -- functions and are refused here.
  if p_status not in ('active', 'suspended') then
    raise exception 'Use approve_agency or reject_agency for that transition.' using errcode = '22023';
  end if;

  update public.agencies set status = p_status where id = p_agency_id;

  if not found then
    raise exception 'Agency not found.' using errcode = 'P0002';
  end if;

  -- Member profiles are untouched: is_active_user() already requires the
  -- agency to be active, so suspending the company locks its users out without
  -- destroying their individual status.
end;
$$;

revoke all on function public.approve_agency(uuid)                              from public, anon;
revoke all on function public.reject_agency(uuid, text)                         from public, anon;
revoke all on function public.set_agency_status(uuid, public.agency_status)     from public, anon;
grant execute on function public.approve_agency(uuid)                           to authenticated;
grant execute on function public.reject_agency(uuid, text)                      to authenticated;
grant execute on function public.set_agency_status(uuid, public.agency_status)  to authenticated;

revoke all on function public.audit_role_change()       from public, anon, authenticated;
revoke all on function public.audit_permission_grant()  from public, anon, authenticated;
revoke all on function public.audit_profile_change()    from public, anon, authenticated;
revoke all on function public.audit_agency_change()     from public, anon, authenticated;

-- ============================================================================
-- 5. Extra permissions this phase introduces
-- ============================================================================

insert into public.permissions (key, module, name_ar, name_en, sort_order)
values
  ('staff.suspend', 'staff', 'تعليق وتفعيل الموظفين', 'Suspend / reactivate staff', 40)
on conflict (key) do update
  set name_ar = excluded.name_ar, name_en = excluded.name_en, sort_order = excluded.sort_order;
