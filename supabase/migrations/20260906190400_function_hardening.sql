-- ============================================================================
-- Phase 1 — function hardening
--
-- Every function in the `public` schema is automatically exposed by PostgREST
-- as an RPC endpoint, and PostgreSQL grants EXECUTE to PUBLIC by default. For
-- SECURITY DEFINER functions that combination means a signed-in user — or an
-- anonymous one — can invoke privileged code directly, bypassing the UI.
--
-- Flagged by Supabase's own security advisor after the first push. The serious
-- one was `write_audit`: it was reachable at /rest/v1/rpc/write_audit, so any
-- caller could have written arbitrary rows into the audit log. A trail anyone
-- can forge entries in is worse than no trail, because it looks authoritative.
--
-- Rule applied below: revoke EXECUTE from anon and authenticated on
-- everything, then grant it back only to the four functions that RLS policies
-- evaluate as the calling user. The rest are reached only from inside other
-- SECURITY DEFINER functions or from trigger dispatch, neither of which needs
-- the caller to hold EXECUTE.
-- ============================================================================

-- ------------------------------------------------------------ search_path fix
-- set_updated_at was the one function without a pinned search_path, so a
-- caller could in principle resolve its references against their own schema.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ------------------------------------------------------------- lock everything

revoke all on function public.has_permission(uuid, text)              from public, anon, authenticated;
revoke all on function public.authorize(text)                         from public, anon, authenticated;
revoke all on function public.is_super_admin(uuid)                    from public, anon, authenticated;
revoke all on function public.current_agency_id()                     from public, anon, authenticated;
revoke all on function public.current_role_id()                       from public, anon, authenticated;
revoke all on function public.is_active_user()                        from public, anon, authenticated;
revoke all on function public.write_audit(text, text, text, jsonb)    from public, anon, authenticated;
revoke all on function public.set_updated_at()                        from public, anon, authenticated;
revoke all on function public.handle_new_user()                       from public, anon, authenticated;
revoke all on function public.handle_user_email_change()              from public, anon, authenticated;
revoke all on function public.prevent_profile_privilege_escalation()  from public, anon, authenticated;
revoke all on function public.protect_last_super_admin()              from public, anon, authenticated;
revoke all on function public.protect_system_roles()                  from public, anon, authenticated;
revoke all on function public.protect_super_admin_permissions()       from public, anon, authenticated;
revoke all on function public.prevent_permission_escalation()         from public, anon, authenticated;

-- --------------------------------------------- grant back only what RLS needs

-- A policy expression is evaluated as the querying user, so these four must
-- stay executable by `authenticated` or every policy that calls them fails
-- closed and the app cannot read its own rows.
--
-- `anon` is deliberately not granted: every policy in this schema is scoped
-- `to authenticated`, so an anonymous request never evaluates one.
grant execute on function public.authorize(text)         to authenticated;
grant execute on function public.current_agency_id()     to authenticated;
grant execute on function public.current_role_id()       to authenticated;
grant execute on function public.is_active_user()        to authenticated;

-- has_permission stays revoked even though it is the core resolver: policies
-- reach it through authorize(), which is SECURITY DEFINER and therefore calls
-- it as the function owner. Leaving it exposed would have let any signed-in
-- user probe *another* user's permissions by passing an arbitrary uuid.

-- Trigger functions need no EXECUTE grant: PostgreSQL checks that privilege
-- when the trigger is created, not each time it fires.
