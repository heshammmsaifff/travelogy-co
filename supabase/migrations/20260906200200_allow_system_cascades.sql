-- ============================================================================
-- Phase 2 — let system-level cascades through the agency field guard
--
-- `agencies.approved_by` and `rejected_by` are `references auth.users(id)
-- on delete set null`. So deleting a back-office user makes Postgres issue
-- `update agencies set approved_by = null ...` on its own behalf — and
-- prevent_agency_privileged_field_change() refused it, because that update
-- touches the approval record and the deleting session is not `service_role`.
--
-- Net effect before this fix: once an admin had approved anything, their auth
-- user could not be deleted at all. Found while cleaning up test data, but it
-- would have bitten the moment a real staff member left.
--
-- The fix: treat "no authenticated user" as a system context. That is safe
-- because every RLS policy on `agencies` is scoped `to authenticated`, so an
-- anonymous request cannot reach an UPDATE in the first place — auth.uid()
-- being null here means Postgres itself, a migration, or the service role.
-- ============================================================================

create or replace function public.prevent_agency_privileged_field_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- System contexts: the service role, migrations, and referential-integrity
  -- cascades issued by Postgres itself.
  if auth.role() = 'service_role' or auth.uid() is null then
    return new;
  end if;

  if public.is_super_admin() then
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

  if (new.approved_at         is distinct from old.approved_at
      or new.approved_by      is distinct from old.approved_by
      or new.rejected_at      is distinct from old.rejected_at
      or new.rejected_by      is distinct from old.rejected_by
      or new.rejection_reason is distinct from old.rejection_reason)
     and not public.has_permission(auth.uid(), 'agencies.approve') then
    raise exception 'You do not have permission to change the approval record.' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_agency_privileged_field_change() from public, anon, authenticated;
