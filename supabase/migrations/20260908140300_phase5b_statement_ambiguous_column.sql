-- ============================================================================
-- Phase 5b fix — `agency_statement` had the same ambiguity as the promo lookup
--
-- Its RETURNS TABLE declares `entry_date`, and the inner CTE produced a column
-- of the same name. The date filter then read `where entry_date >= p_from`,
-- which Postgres could not resolve between the OUT variable and the CTE
-- column, so the whole statement failed with:
--
--     column reference "entry_date" is ambiguous
--
-- Two functions written in the same sitting, the same mistake in both. The
-- habit that prevents it is aliasing every source and qualifying every column
-- inside a function whose OUT names mirror its data — which is what this does.
-- ============================================================================

create or replace function public.agency_statement(
  p_agency_id uuid,
  p_from      date default null,
  p_to        date default null
)
returns table (
  entry_date      date,
  entry_type      text,
  reference       text,
  description     text,
  debit           numeric,
  credit          numeric,
  running_balance numeric,
  currency_code   char(3)
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  -- The caller must be a member of this agency, or hold the permission.
  -- Standing rule (§15, 5.x): a null auth.uid() is a system context.
  if auth.uid() is not null
     and not public.has_permission(auth.uid(), 'finance.statements.view')
     and not (p_agency_id = public.current_agency_id() and public.is_active_user()) then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  return query
  with entries as (
    select b.created_at::date as e_date,
           'booking'::text    as e_type,
           b.reference        as e_reference,
           coalesce(b.agency_name, '') || ' · ' || b.lead_guest_name as e_description,
           b.total_sell       as e_debit,
           0::numeric         as e_credit,
           b.currency_code    as e_currency,
           b.created_at       as e_sort
    from public.bookings b
    where b.agency_id = p_agency_id
      -- A cancelled booking owes nothing, so it leaves the statement entirely.
      and b.status in ('pending', 'confirmed', 'completed')

    union all

    select p.paid_on,
           case p.kind when 'refund' then 'refund' else 'payment' end,
           p.reference,
           coalesce(p.external_reference, p.method::text),
           -- A refund puts money back to the agent, so it increases what they
           -- owe again. Modelling it as a debit keeps every amount positive
           -- and the running balance readable.
           case p.kind when 'refund' then p.amount else 0::numeric end,
           case p.kind when 'refund' then 0::numeric else p.amount end,
           p.currency_code,
           p.created_at
    from public.payments p
    where p.agency_id = p_agency_id
  ),
  filtered as (
    select e.* from entries e
    where (p_from is null or e.e_date >= p_from)
      and (p_to   is null or e.e_date <= p_to)
  )
  select f.e_date,
         f.e_type,
         f.e_reference,
         f.e_description,
         f.e_debit,
         f.e_credit,
         sum(f.e_debit - f.e_credit) over (order by f.e_sort, f.e_reference
                                           rows between unbounded preceding and current row),
         f.e_currency
  from filtered f
  order by f.e_sort, f.e_reference;
end;
$$;
