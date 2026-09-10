-- ============================================================================
-- Fix: a won lead made its agency — and that agency's last user — undeletable.
--
-- `crm_leads.agency_id` is `on delete set null`, and `crm_leads_won_has_agency`
-- required a won lead to have a non-null `agency_id`. So deleting an agency
-- made Postgres issue its own `update crm_leads set agency_id = null`, the
-- CHECK refused it, and the agency delete failed. The profile-delete trigger
-- from `20260907090100` then failed with it, which means **deleting the last
-- user of any agency that had ever been won as a lead was impossible**.
--
-- This is the same shape as the Phase 2 bug in §15: `agencies.approved_by` was
-- `on delete set null` and a guard refused the null, so an admin who had
-- approved anything could not be deleted. Found the same way too — by a
-- teardown that would not tear down.
--
-- THE FIX follows the pattern this project already uses for exactly this
-- problem (§15, 9.4 and 10.7): the lead carries a SNAPSHOT of the agency it
-- became. The foreign key stays a live link and may go null; the evidence that
-- the lead was won lives in columns nothing can revoke.
-- ============================================================================

alter table public.crm_leads
  add column if not exists won_agency_name text,
  add column if not exists won_agency_code text;

comment on column public.crm_leads.won_agency_code is
  'Snapshot of the agency this lead became, taken at conversion. The FK beside it can go null when a company is deleted; this cannot, so the pipeline keeps its history and the agency stays deletable.';

-- Existing won leads keep their evidence.
update public.crm_leads l
   set won_agency_name = a.name,
       won_agency_code = a.code
  from public.agencies a
 where a.id = l.agency_id
   and l.stage = 'won'
   and l.won_agency_code is null;

alter table public.crm_leads drop constraint crm_leads_won_has_agency;

alter table public.crm_leads
  add constraint crm_leads_won_has_agency
    check (stage <> 'won' or won_agency_code is not null);

-- ----------------------------------------------------------------------------
-- `convert_lead` now writes the snapshot as well as the link.
-- ----------------------------------------------------------------------------

create or replace function public.convert_lead(
  p_lead_id   uuid,
  p_agency_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_stage    public.lead_stage;
  v_agency   record;
  v_existing uuid;
begin
  if auth.uid() is not null and not public.has_permission(auth.uid(), 'crm.manage') then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  select stage into v_stage from public.crm_leads where id = p_lead_id;
  if v_stage is null then
    raise exception 'That lead no longer exists.' using errcode = 'P0002';
  end if;
  if v_stage = 'won' then
    raise exception 'That lead has already been won.' using errcode = '22023';
  end if;

  select id, name, code into v_agency from public.agencies where id = p_agency_id;
  if v_agency.id is null then
    raise exception 'That agency no longer exists.' using errcode = 'P0002';
  end if;

  select id into v_existing
  from public.crm_leads
  where agency_id = p_agency_id and id <> p_lead_id;

  if v_existing is not null then
    raise exception 'Another lead is already linked to that agency.' using errcode = '23505';
  end if;

  update public.crm_leads
     set stage = 'won',
         agency_id = p_agency_id,
         won_agency_name = v_agency.name,
         won_agency_code = v_agency.code,
         lost_reason = null
   where id = p_lead_id;

  perform public.write_audit('convert', 'crm_leads', p_lead_id::text,
                             jsonb_build_object('agency_id', p_agency_id,
                                                'agency_code', v_agency.code));
end;
$$;

revoke all on function public.convert_lead(uuid, uuid) from public, anon;
grant execute on function public.convert_lead(uuid, uuid) to authenticated;
