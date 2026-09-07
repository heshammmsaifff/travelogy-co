-- ============================================================================
-- Fix: an agency outlives its last member
--
-- `profiles.id` cascades from `auth.users`, and `profiles.agency_id` cascades
-- from `agencies` — but nothing points the other way. So deleting a user
-- removes their profile and leaves the agency behind: a company with no
-- members, stuck in `pending` forever, sitting in the admin's approval queue
-- and holding an agency code that will never be used.
--
-- Two ways it happens in practice:
--   - an admin deletes an auth user from the Supabase dashboard
--   - a signup that GoTrue creates and then unwinds (for example when the
--     confirmation email cannot be sent) — the trigger's agency insert is not
--     always unwound with it
--
-- An agency with no members cannot be signed into and cannot be approved into
-- anything useful, so removing it is the honest outcome rather than leaving
-- dead rows for a human to recognise and clear by hand.
-- ============================================================================

create or replace function public.cleanup_orphan_agency()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- No recursion risk from the cascade direction: deleting an agency cascades
  -- into its profiles, each of which lands here, and the DELETE below then
  -- finds no visible row because that agency is already being removed in this
  -- same statement.
  if old.agency_id is not null
     and not exists (select 1 from public.profiles where agency_id = old.agency_id) then
    delete from public.agencies where id = old.agency_id;
  end if;

  return old;
end;
$$;

revoke all on function public.cleanup_orphan_agency() from public, anon, authenticated;

create trigger profiles_cleanup_orphan_agency
  after delete on public.profiles
  for each row execute function public.cleanup_orphan_agency();

-- Clear the agencies already orphaned before this trigger existed.
delete from public.agencies a
where not exists (select 1 from public.profiles p where p.agency_id = a.id);
