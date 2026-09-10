-- ============================================================================
-- Phase 8b — `drivers.manage` can actually manage a driver
--
-- Found by the verification suite, and only because it asked what the ROW said
-- afterwards rather than whether an error came back.
--
-- The gap: `profiles_select` grants visibility to `agencies.view` or
-- `staff.view`, and `profiles_update` to `staff.update`. A role holding only
-- `drivers.manage` could therefore write the `drivers` table but could not see
-- the person's name or change their account status — a permission that does
-- not do what its name says (§2.3). Worse for testing: an UPDATE that RLS
-- filters to zero rows returns NO ERROR, so a suite asserting "an error was
-- raised" reads that as protection and a suite asserting "no error" reads it
-- as success. Both of ours did, in the same run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Seeing a driver
--
-- Read only, and only driver-scoped rows: `drivers.manage` is not a licence to
-- browse the staff or agency directory. Policies may call only the four
-- caller-executable functions (§15, Phase 4) — `authorize` is one, and the
-- scope test is a plain subquery.
-- ----------------------------------------------------------------------------

drop policy if exists profiles_select on public.profiles;

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
    -- Driver operations: the people who run the fleet may see the drivers, and
    -- nobody else in that directory.
    or (
      (public.authorize('drivers.manage') or public.authorize('dispatch.manage'))
      and exists (
        select 1 from public.roles r
        where r.id = role_id and r.scope = 'driver'
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 2. Activating and suspending a driver
--
-- An RPC rather than a widened `profiles_update`, for the reason approve /
-- suspend are RPCs on the agency side (§15, 3.3): two rows have to move
-- together. `drivers.is_active` decides whether dispatch may give them work;
-- `profiles.status` decides whether they can sign in. Letting those drift
-- produces either a driver who is assigned jobs they cannot see, or one who
-- can sign in to a list that will always be empty.
-- ----------------------------------------------------------------------------

create or replace function public.set_driver_active(
  p_driver_id uuid,
  p_active    boolean
)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile uuid;
begin
  -- The standing rule (§15, 5.x): a system context has no auth.uid().
  if auth.uid() is not null and not public.has_permission(auth.uid(), 'drivers.manage') then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  select profile_id into v_profile from public.drivers where id = p_driver_id;
  if v_profile is null then
    raise exception 'That driver no longer exists.' using errcode = 'P0002';
  end if;

  update public.drivers set is_active = p_active where id = p_driver_id;

  update public.profiles
     set status = case when p_active then 'active' else 'suspended' end,
         suspended_at = case when p_active then null else now() end
   where id = v_profile;
end;
$$;

revoke all on function public.set_driver_active(uuid, boolean) from public, anon;
grant execute on function public.set_driver_active(uuid, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Why `profiles_update` is deliberately NOT widened
--
-- A `staff.update` holder can already reach a driver's row through it, and the
-- escalation guard (20260908190200) refuses them unless they also hold
-- `drivers.manage`. That is the branch worth having: the risk is not a role
-- with too little access, it is a general staff administrator quietly
-- suspending the fleet. Adding `drivers.manage` to `profiles_update` as well
-- would give two paths to the same act, and the RPC above is the one that
-- keeps both rows in step.
-- ----------------------------------------------------------------------------
