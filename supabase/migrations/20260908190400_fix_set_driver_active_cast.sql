-- ============================================================================
-- Fix: set_driver_active could not write a status at all.
--
-- `status = case when p_active then 'active' else 'suspended' end` gives
-- Postgres two untyped string literals and nothing to infer from, so it typed
-- the CASE as `text` and refused the assignment:
--
--   column "status" is of type user_status but expression is of type text
--
-- Every call failed. It was invisible until the suite checked what the ROW
-- said afterwards rather than whether the call returned an error — the
-- companion check ("and reactivates both") had been passing the whole time,
-- because the driver it expected to find active had never been deactivated.
-- ============================================================================

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
  if auth.uid() is not null and not public.has_permission(auth.uid(), 'drivers.manage') then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  select profile_id into v_profile from public.drivers where id = p_driver_id;
  if v_profile is null then
    raise exception 'That driver no longer exists.' using errcode = 'P0002';
  end if;

  update public.drivers set is_active = p_active where id = p_driver_id;

  update public.profiles
     set status = case
                    when p_active then 'active'::public.user_status
                    else 'suspended'::public.user_status
                  end,
         suspended_at = case when p_active then null else now() end
   where id = v_profile;
end;
$$;

revoke all on function public.set_driver_active(uuid, boolean) from public, anon;
grant execute on function public.set_driver_active(uuid, boolean) to authenticated;
