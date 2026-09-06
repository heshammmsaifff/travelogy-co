-- ============================================================================
-- Phase 1 — authorization functions, signup wiring and integrity guards
--
-- Every function here is SECURITY DEFINER with a pinned search_path. That
-- combination is what lets an RLS policy call it without recursing back into
-- the same policy, and stops a caller from shadowing `profiles` with their own
-- table to change what the function resolves.
--
-- CLAUDE.md §7 (enforcement rules), §12 (security rules).
-- ============================================================================

-- ============================================================================
-- 1. Authorization resolvers
-- ============================================================================

-- The function every RLS policy calls. CLAUDE.md §7 rule 1: policies must
-- never compare role names, because `role = 'staff'` silently fails to cover
-- the fifth role somebody creates from the back-office.
--
-- super_admin short-circuits to true (§7): it holds every permission
-- implicitly and is never evaluated against role_permissions.
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
    where p.id = p_user_id
      -- A suspended or pending account holds no permissions, whatever its role.
      and p.status = 'active'
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

comment on function public.has_permission(uuid, text) is
  'Resolves caller -> role -> permissions. The only sanctioned way for an RLS policy to make an access decision (CLAUDE.md §7).';

-- Convenience wrapper for the common case: "may the current user do X?"
create or replace function public.authorize(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.has_permission(auth.uid(), p_permission);
$$;

create or replace function public.is_super_admin(p_user_id uuid default auth.uid())
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
    where p.id = p_user_id
      and p.status = 'active'
      and r.key = 'super_admin'
  );
$$;

-- The caller's agency, or null for back-office staff. Used by agent-side RLS
-- policies to scope rows to the caller's own company.
create or replace function public.current_agency_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select agency_id from public.profiles where id = auth.uid();
$$;

create or replace function public.current_role_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role_id from public.profiles where id = auth.uid();
$$;

-- Only an *active* account may act. Pending and suspended users hold a valid
-- session but must not read or write business data.
create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'active'
  );
$$;

-- ============================================================================
-- 2. Audit helper
-- ============================================================================

create or replace function public.write_audit(
  p_action      text,
  p_entity_type text,
  p_entity_id   text,
  p_changes     jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text;
begin
  select email into v_email from public.profiles where id = auth.uid();

  insert into public.audit_log (actor_id, actor_email, action, entity_type, entity_id, changes)
  values (auth.uid(), v_email, p_action, p_entity_type, p_entity_id, p_changes);
end;
$$;

-- ============================================================================
-- 3. Signup wiring
-- ============================================================================

-- Creates the profile (and, for an agent self-registration, the agency) in the
-- same transaction as the auth.users insert, so a half-registered account can
-- never exist.
--
-- Everything it reads comes from raw_user_meta_data, which the client controls.
-- That is why the role is NOT taken from metadata: a self-registering user is
-- always agent_owner + pending. Staff accounts are created by an admin through
-- a privileged server-side path in Phase 2, never through this trigger.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role_id     uuid;
  v_agency_id   uuid;
  v_meta        jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_agency_name text := nullif(btrim(v_meta ->> 'agency_name'), '');
  v_full_name   text := coalesce(nullif(btrim(v_meta ->> 'full_name'), ''), '');
  v_locale      text := coalesce(nullif(v_meta ->> 'preferred_locale', ''), 'ar');
begin
  -- Self-registration is always an agent company owner, awaiting approval.
  select id into v_role_id from public.roles where key = 'agent_owner';

  if v_role_id is null then
    raise exception 'Seed roles are missing: agent_owner not found';
  end if;

  if v_agency_name is not null then
    insert into public.agencies (
      code, name, email, phone, country_code, city, commercial_reg_no, tax_id, status
    )
    values (
      'LLT-A-' || lpad(nextval('public.agency_code_seq')::text, 6, '0'),
      v_agency_name,
      new.email,
      nullif(btrim(v_meta ->> 'phone'), ''),
      upper(coalesce(nullif(btrim(v_meta ->> 'country_code'), ''), 'EG')),
      nullif(btrim(v_meta ->> 'city'), ''),
      nullif(btrim(v_meta ->> 'commercial_reg_no'), ''),
      nullif(btrim(v_meta ->> 'tax_id'), ''),
      'pending'
    )
    returning id into v_agency_id;
  end if;

  insert into public.profiles (id, email, full_name, phone, role_id, agency_id, status, preferred_locale)
  values (
    new.id,
    new.email,
    v_full_name,
    nullif(btrim(v_meta ->> 'phone'), ''),
    v_role_id,
    v_agency_id,
    'pending',
    case when v_locale in ('ar', 'en') then v_locale else 'ar' end
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keeps profiles.email in step when a user changes their email through
-- Supabase Auth, so the denormalised copy never drifts.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- ============================================================================
-- 4. Integrity guards
--
-- These are triggers rather than UI checks on purpose. CLAUDE.md §7 rule 3:
-- an access-control system that can lock its owner out is a defect, and a
-- guard that lives only in a form is not a guard.
-- ============================================================================

-- Stops a user editing their own row into more power than they were given.
-- Without this, "update your own profile" — which agents legitimately need —
-- would also let them set role_id to super_admin.
create or replace function public.prevent_profile_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- The service role runs migrations, seeds and privileged server-side
  -- use-cases; it is trusted and exempt.
  if auth.role() = 'service_role' then
    return new;
  end if;

  if auth.uid() = new.id then
    if new.role_id is distinct from old.role_id then
      raise exception 'You cannot change your own role.' using errcode = '42501';
    end if;
    if new.status is distinct from old.status then
      raise exception 'You cannot change your own account status.' using errcode = '42501';
    end if;
    if new.agency_id is distinct from old.agency_id then
      raise exception 'You cannot move yourself to another agency.' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger profiles_prevent_escalation
  before update on public.profiles
  for each row execute function public.prevent_profile_privilege_escalation();

-- Lockout protection (CLAUDE.md §7 rule 3). The last *active* super_admin
-- cannot be demoted, suspended or deleted — by anyone, including themselves
-- and including the service role, because losing the last super_admin is
-- unrecoverable from inside the product.
create or replace function public.protect_last_super_admin()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_super_admin_role_id uuid;
  v_remaining           integer;
  v_was_active_super    boolean;
begin
  select id into v_super_admin_role_id from public.roles where key = 'super_admin';

  v_was_active_super := (old.role_id = v_super_admin_role_id and old.status = 'active');

  if not v_was_active_super then
    return coalesce(new, old);
  end if;

  -- Would this row still be an active super_admin afterwards?
  if tg_op = 'UPDATE'
     and new.role_id = v_super_admin_role_id
     and new.status = 'active' then
    return new;
  end if;

  select count(*) into v_remaining
  from public.profiles
  where role_id = v_super_admin_role_id
    and status = 'active'
    and id <> old.id;

  if v_remaining = 0 then
    raise exception
      'This is the last active super admin. Promote another user to super admin first.'
      using errcode = '23514';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger profiles_protect_last_super_admin
  before update or delete on public.profiles
  for each row execute function public.protect_last_super_admin();

-- System roles are structural: code and seeds refer to them by key.
create or replace function public.protect_system_roles()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if old.is_system then
      raise exception 'System roles cannot be deleted.' using errcode = '42501';
    end if;
    return old;
  end if;

  if old.is_system then
    if new.key is distinct from old.key then
      raise exception 'The key of a system role cannot be changed.' using errcode = '42501';
    end if;
    if new.is_system is distinct from old.is_system then
      raise exception 'A system role cannot be converted to a custom role.' using errcode = '42501';
    end if;
    if new.scope is distinct from old.scope then
      raise exception 'The scope of a system role cannot be changed.' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger roles_protect_system
  before update or delete on public.roles
  for each row execute function public.protect_system_roles();

-- super_admin's permissions are implicit (has_permission short-circuits), so
-- rows here would be meaningless — and their absence must never be read as a
-- lack of access. Blocking the write keeps the model unambiguous.
create or replace function public.protect_super_admin_permissions()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role_key text;
begin
  select key into v_role_key
  from public.roles
  where id = coalesce(new.role_id, old.role_id);

  if v_role_key = 'super_admin' then
    raise exception
      'super_admin holds every permission implicitly; its grants cannot be edited.'
      using errcode = '42501';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger role_permissions_protect_super_admin
  before insert or update or delete on public.role_permissions
  for each row execute function public.protect_super_admin_permissions();

-- CLAUDE.md §7 rule 5: granting a permission you do not hold is privilege
-- escalation. Without this, any role with settings.roles.manage could quietly
-- promote itself to full access by creating a role that has everything.
create or replace function public.prevent_permission_escalation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() = 'service_role' or auth.uid() is null then
    return new;  -- migrations and seeds
  end if;

  if public.is_super_admin() then
    return new;
  end if;

  if not public.has_permission(auth.uid(), new.permission_key) then
    raise exception
      'You cannot grant a permission you do not hold yourself (%).', new.permission_key
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger role_permissions_prevent_escalation
  before insert on public.role_permissions
  for each row execute function public.prevent_permission_escalation();

-- ============================================================================
-- 5. One-time bootstrap
-- ============================================================================

-- Promotes an existing, already-signed-up user to super_admin. Deliberately
-- refuses to run once any active super_admin exists, so it cannot be used as a
-- back door later: it is a first-run step, not an API.
create or replace function public.bootstrap_super_admin(p_email text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role_id uuid;
  v_user_id uuid;
  v_count   integer;
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

  select id into v_user_id from public.profiles where lower(email) = lower(btrim(p_email));

  if v_user_id is null then
    raise exception 'No account found for %. Sign up first, then run this.', p_email;
  end if;

  update public.profiles
  set role_id     = v_role_id,
      status      = 'active',
      agency_id   = null,   -- back-office staff belong to no agency
      approved_at = now()
  where id = v_user_id;

  insert into public.audit_log (actor_id, actor_email, action, entity_type, entity_id, changes)
  values (v_user_id, p_email, 'bootstrap_super_admin', 'profile', v_user_id::text,
          jsonb_build_object('role', 'super_admin'));

  return 'Promoted ' || p_email || ' to super_admin.';
end;
$$;

-- Callable only by the service role / SQL editor, never by a logged-in client.
revoke all on function public.bootstrap_super_admin(text) from public, anon, authenticated;
