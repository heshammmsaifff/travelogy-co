-- ============================================================================
-- Phase 3a — server-side hotel reference codes
--
-- Generating the code in the application would mean reading the highest
-- existing one and adding one, which two admins creating a hotel at the same
-- moment would both do and both get the same answer. A sequence cannot
-- produce a duplicate, so the code is minted here.
-- ============================================================================

create or replace function public.next_hotel_code()
returns text
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  select 'LLT-H-' || lpad(nextval('public.hotel_code_seq')::text, 6, '0');
$$;

revoke all on function public.next_hotel_code() from public, anon;
-- Callable by signed-in users, but creating the hotel itself still requires
-- hotels.create through RLS — burning a sequence value grants nothing.
grant execute on function public.next_hotel_code() to authenticated;
