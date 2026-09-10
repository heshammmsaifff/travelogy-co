-- ============================================================================
-- Phase 8d — the CRM's two questions the database answers itself
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The pipeline, counted in Postgres
--
-- §11 wants aggregation in the database rather than rows pulled into
-- JavaScript to be counted. It also keeps the board honest: the number on a
-- column heading and the cards under it come from the same query.
-- ----------------------------------------------------------------------------

create or replace function public.crm_pipeline_summary()
returns table (stage public.lead_stage, lead_count bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null
     and not (public.has_permission(auth.uid(), 'crm.view')
              or public.has_permission(auth.uid(), 'crm.manage')) then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  return query
  select s.stage, count(l.id) as lead_count
  from unnest(enum_range(null::public.lead_stage)) as s(stage)
  left join public.crm_leads l on l.stage = s.stage
  group by s.stage
  -- `enum_range` is already in declaration order, which is the pipeline order.
  order by array_position(enum_range(null::public.lead_stage), s.stage);
end;
$$;

revoke all on function public.crm_pipeline_summary() from public, anon;
grant execute on function public.crm_pipeline_summary() to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Winning a lead
--
-- An RPC rather than an UPDATE, for the reason approve/suspend are RPCs
-- (§15, 3.3): two things have to move together and half of it applied is
-- worse than none. It also refuses the two mistakes that would corrupt the
-- pipeline quietly — linking to an agency another lead already claims, and
-- winning a lead twice.
--
-- What it deliberately does NOT do is create an agency. Agencies exist only
-- through registration plus approval; a second path would be a way past the
-- gate that §7 puts there.
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
  v_existing uuid;
begin
  -- The standing rule (§15, 5.x): a system context has no auth.uid().
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

  if not exists (select 1 from public.agencies where id = p_agency_id) then
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
         -- A won lead cannot also carry a reason it was lost.
         lost_reason = null
   where id = p_lead_id;

  perform public.write_audit('convert', 'crm_leads', p_lead_id::text,
                             jsonb_build_object('agency_id', p_agency_id));
end;
$$;

revoke all on function public.convert_lead(uuid, uuid) from public, anon;
grant execute on function public.convert_lead(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Completing a task
--
-- `status` and `completed_at` are bound by a CHECK, so moving one without the
-- other is refused by the table. This is the one call that moves both, which
-- means no screen has to remember the pairing.
-- ----------------------------------------------------------------------------

create or replace function public.set_task_status(
  p_task_id uuid,
  p_status  public.task_status
)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and not public.has_permission(auth.uid(), 'crm.manage') then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.crm_tasks where id = p_task_id) then
    raise exception 'That task no longer exists.' using errcode = 'P0002';
  end if;

  update public.crm_tasks
     set status = p_status,
         completed_at = case when p_status = 'done' then now() else null end
   where id = p_task_id;
end;
$$;

revoke all on function public.set_task_status(uuid, public.task_status) from public, anon;
grant execute on function public.set_task_status(uuid, public.task_status) to authenticated;
