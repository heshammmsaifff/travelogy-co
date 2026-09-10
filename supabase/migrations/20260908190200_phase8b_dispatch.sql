-- ============================================================================
-- Phase 8b — the privilege guard learns about drivers, and dispatch gets its
-- functions.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The profile privilege guard
--
-- WHY THIS HAD TO CHANGE, stated plainly because it is the dangerous part:
-- the guard was written as `if scope = 'admin' … else <agent rules>`. A third
-- scope falls into the ELSE, so a driver would have been governed by the
-- agency rules — which demand `agency_users.manage` and a matching
-- `agency_id`, and a driver has no agency. That is fail-closed for role
-- changes (nobody but a super admin could create a driver), but the STATUS
-- branch was worse: its `elsif` chain lets anyone holding `agencies.approve`
-- or `agencies.suspend` change the status of a non-admin account, which would
-- have included every driver. Both branches now name `driver` explicitly and
-- gate it on `drivers.manage`.
--
-- Everything else in this function is unchanged from 20260906190500.
-- ----------------------------------------------------------------------------

create or replace function public.prevent_profile_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor          uuid := auth.uid();
  v_new_role_key   text;
  v_new_role_scope public.role_scope;
  v_old_role_scope public.role_scope;
begin
  -- Migrations, seeds and privileged server-side use-cases. `auth.uid() is
  -- null` covers the SQL editor and Postgres itself (§15, 5.x standing rule).
  if auth.role() = 'service_role' or v_actor is null then
    return new;
  end if;

  if public.is_super_admin(v_actor) then
    return new;
  end if;

  if new.email is distinct from old.email then
    raise exception 'Email is managed by the authentication system.' using errcode = '42501';
  end if;

  if new.agency_id is distinct from old.agency_id then
    raise exception 'Only a super admin can move a user between agencies.' using errcode = '42501';
  end if;

  select scope into v_old_role_scope from public.roles where id = old.role_id;

  -- ---------------------------------------------------------------- role_id
  if new.role_id is distinct from old.role_id then
    if v_actor = new.id then
      raise exception 'You cannot change your own role.' using errcode = '42501';
    end if;

    select key, scope into v_new_role_key, v_new_role_scope
    from public.roles where id = new.role_id;

    if v_new_role_key = 'super_admin' then
      raise exception 'Only a super admin can grant the super admin role.' using errcode = '42501';
    end if;

    -- Taking a role AWAY from a driver is as sensitive as giving one, so the
    -- old scope is checked before the new one.
    if v_old_role_scope = 'driver' and not public.has_permission(v_actor, 'drivers.manage') then
      raise exception 'You do not have permission to change a driver account.' using errcode = '42501';
    end if;

    if v_new_role_scope = 'admin' then
      if not public.has_permission(v_actor, 'staff.update') then
        raise exception 'You do not have permission to assign back-office roles.' using errcode = '42501';
      end if;

    elsif v_new_role_scope = 'driver' then
      if v_old_role_scope = 'admin' then
        raise exception 'You cannot change the role of a back-office user.' using errcode = '42501';
      end if;
      if not public.has_permission(v_actor, 'drivers.manage') then
        raise exception 'You do not have permission to assign the driver role.' using errcode = '42501';
      end if;

    else
      -- Agent-scope role: only an agency user manager, only inside their own
      -- agency, and never against a back-office account.
      if v_old_role_scope = 'admin' then
        raise exception 'You cannot change the role of a back-office user.' using errcode = '42501';
      end if;

      if not public.has_permission(v_actor, 'agency_users.manage')
         or old.agency_id is null
         or old.agency_id is distinct from public.current_agency_id() then
        raise exception 'You do not have permission to assign this role.' using errcode = '42501';
      end if;
    end if;
  end if;

  -- ----------------------------------------------------------------- status
  if new.status is distinct from old.status then
    if v_actor = new.id then
      raise exception 'You cannot change your own account status.' using errcode = '42501';
    end if;

    if v_old_role_scope = 'admin' then
      if not public.has_permission(v_actor, 'staff.update') then
        raise exception 'You do not have permission to change a staff account status.'
          using errcode = '42501';
      end if;

    -- BEFORE the agency clauses: without this a role holding `agencies.approve`
    -- could suspend or reinstate any driver, which is not what that key means.
    elsif v_old_role_scope = 'driver' then
      if not public.has_permission(v_actor, 'drivers.manage') then
        raise exception 'You do not have permission to change a driver account status.'
          using errcode = '42501';
      end if;

    elsif public.has_permission(v_actor, 'agencies.approve')
       or public.has_permission(v_actor, 'agencies.suspend') then
      null;  -- back-office approver acting on an agent account
    elsif public.has_permission(v_actor, 'agency_users.manage')
      and old.agency_id is not null
      and old.agency_id = public.current_agency_id()
      and new.status in ('active', 'suspended') then
      null;
    else
      raise exception 'You do not have permission to change this account status.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_profile_privilege_escalation() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. Assigning a driver
--
-- No INSERT policy exists on `driver_assignments`, so this is the only way in
-- (§15, 10.5). It has to be, because "is this seat already taken", "is this
-- driver already out at that minute" and "does this booking even have a fourth
-- car" all have to be decided in one transaction.
-- ----------------------------------------------------------------------------

create or replace function public.assign_driver(
  p_transfer_item_id uuid,
  p_driver_id        uuid,
  p_vehicle_seq      integer
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_status  public.booking_status;
  v_active  boolean;
  v_id      uuid;
begin
  -- The standing rule (§15, 5.x): a system context has no auth.uid(), and
  -- refusing it would make this unusable from a migration or an ops script.
  if auth.uid() is not null and not public.has_permission(auth.uid(), 'dispatch.manage') then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  select b.status into v_status
  from public.transfer_items ti
  join public.bookings b on b.id = ti.booking_id
  where ti.id = p_transfer_item_id;

  if v_status is null then
    raise exception 'That transfer no longer exists.' using errcode = 'P0002';
  end if;
  if v_status = 'cancelled' then
    raise exception 'That booking is cancelled.' using errcode = '22023';
  end if;

  select d.is_active into v_active from public.drivers d where d.id = p_driver_id;
  if v_active is null then
    raise exception 'That driver no longer exists.' using errcode = 'P0002';
  end if;
  if not v_active then
    raise exception 'That driver is not active.' using errcode = '22023';
  end if;

  begin
    insert into public.driver_assignments (
      transfer_item_id, driver_id, vehicle_seq, assigned_by,
      -- Placeholders: the BEFORE trigger overwrites both from the item, so a
      -- caller cannot choose a date that dodges the clash index.
      job_date
    ) values (
      p_transfer_item_id, p_driver_id, p_vehicle_seq, auth.uid(), current_date
    )
    returning id into v_id;
  exception
    when unique_violation then
      -- Three different indexes can raise this, and the dispatcher can act on
      -- each one differently — so they get three different messages.
      if position('one_per_vehicle' in sqlerrm) > 0 then
        raise exception 'That vehicle already has a driver.' using errcode = '23505';
      elsif position('one_car_each' in sqlerrm) > 0 then
        raise exception 'That driver is already on this transfer.' using errcode = '23505';
      else
        raise exception 'That driver is already booked at that time.' using errcode = '23505';
      end if;
  end;

  return v_id;
end;
$$;

revoke all on function public.assign_driver(uuid, uuid, integer) from public, anon;
grant execute on function public.assign_driver(uuid, uuid, integer) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Pulling a driver off a job
--
-- The row is CANCELLED, never deleted: "this driver was assigned and then
-- taken off" is a fact worth keeping when a guest complains about a late car.
-- The partial unique indexes ignore cancelled rows, so the seat frees up.
-- ----------------------------------------------------------------------------

create or replace function public.unassign_driver(p_assignment_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_status public.assignment_status;
begin
  if auth.uid() is not null and not public.has_permission(auth.uid(), 'dispatch.manage') then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  select status into v_status
  from public.driver_assignments where id = p_assignment_id;

  if v_status is null then
    raise exception 'That assignment no longer exists.' using errcode = 'P0002';
  end if;

  -- Once the passengers are aboard, the job happened. Un-assigning it would
  -- erase a journey that took place.
  if v_status in ('picked_up', 'completed') then
    raise exception 'That job has already started.' using errcode = '22023';
  end if;

  update public.driver_assignments
     set status = 'cancelled'
   where id = p_assignment_id;
end;
$$;

revoke all on function public.unassign_driver(uuid) from public, anon;
grant execute on function public.unassign_driver(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Moving a job forward — the driver's own action
--
-- The one write a driver may make. Forward-only: a completed job cannot go
-- back to "on my way", because the timestamps behind those states are what a
-- later dispute is settled with.
-- ----------------------------------------------------------------------------

create or replace function public.advance_assignment(
  p_assignment_id uuid,
  p_status        public.assignment_status,
  p_notes         text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_current   public.assignment_status;
  v_driver    uuid;
  v_is_mine   boolean;
  v_dispatch  boolean := auth.uid() is null
                         or public.has_permission(auth.uid(), 'dispatch.manage');
  -- Rank expresses the one-way street. `no_show` and `cancelled` are terminal
  -- and sit outside it.
  v_rank      constant jsonb :=
    '{"assigned":1,"en_route":2,"arrived":3,"picked_up":4,"completed":5}'::jsonb;
begin
  select a.status, a.driver_id into v_current, v_driver
  from public.driver_assignments a where a.id = p_assignment_id;

  if v_current is null then
    raise exception 'That assignment no longer exists.' using errcode = 'P0002';
  end if;

  select exists (
    select 1 from public.drivers d
    where d.id = v_driver and d.profile_id = auth.uid()
  ) into v_is_mine;

  if not v_is_mine and not v_dispatch then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  if v_current in ('completed', 'no_show', 'cancelled') then
    raise exception 'That job is already closed.' using errcode = '22023';
  end if;

  -- Only dispatch cancels; a driver who cannot do a job says so by telephone,
  -- and the office decides what replaces them.
  if p_status = 'cancelled' and not v_dispatch then
    raise exception 'Only dispatch can cancel a job.' using errcode = '42501';
  end if;

  if p_status not in ('no_show', 'cancelled')
     and (v_rank ->> p_status::text)::int <= (v_rank ->> v_current::text)::int then
    raise exception 'A job cannot go backwards.' using errcode = '22023';
  end if;

  update public.driver_assignments
     set status       = p_status,
         driver_notes = coalesce(nullif(btrim(p_notes), ''), driver_notes),
         started_at   = case when p_status = 'en_route'  then now() else started_at end,
         arrived_at   = case when p_status = 'arrived'   then now() else arrived_at end,
         picked_up_at = case when p_status = 'picked_up' then now() else picked_up_at end,
         completed_at = case when p_status in ('completed', 'no_show')
                             then now() else completed_at end
   where id = p_assignment_id;
end;
$$;

revoke all on function public.advance_assignment(uuid, public.assignment_status, text)
  from public, anon;
grant execute on function public.advance_assignment(uuid, public.assignment_status, text)
  to authenticated;

-- ----------------------------------------------------------------------------
-- 5. A driver's own day
--
-- NO PRICES. Not the sell price, not the net, not the currency. A driver is
-- handed the same information a voucher carries and nothing more (§15, 12.5)
-- — and because this function returns the columns rather than the table, that
-- is structural rather than a habit someone has to remember.
-- ----------------------------------------------------------------------------

create or replace function public.my_driver_jobs(
  p_from date default current_date,
  p_to   date default null
)
returns table (
  assignment_id  uuid,
  status         public.assignment_status,
  vehicle_seq    smallint,
  vehicles       smallint,
  job_date       date,
  pickup_time    time,
  reference      text,
  from_name_ar   text,
  from_name_en   text,
  to_name_ar     text,
  to_name_en     text,
  city_ar        text,
  city_en        text,
  direction      public.transfer_direction,
  vehicle_name_ar text,
  vehicle_name_en text,
  passengers     smallint,
  flight_number  text,
  pickup_notes   text,
  guest_name     text,
  guest_phone    text,
  driver_notes   text,
  booking_status public.booking_status
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_active_user() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  return query
  select a.id, a.status, a.vehicle_seq, ti.vehicles,
         a.job_date, a.pickup_time,
         b.reference,
         ti.from_name_ar, ti.from_name_en, ti.to_name_ar, ti.to_name_en,
         ti.city_ar, ti.city_en, ti.direction,
         ti.vehicle_name_ar, ti.vehicle_name_en,
         ti.passengers, ti.flight_number, ti.pickup_notes,
         b.lead_guest_name, b.lead_guest_phone,
         a.driver_notes, b.status
  from public.driver_assignments a
  join public.drivers d on d.id = a.driver_id and d.profile_id = auth.uid()
  join public.transfer_items ti on ti.id = a.transfer_item_id
  join public.bookings b on b.id = ti.booking_id
  where a.job_date >= p_from
    and (p_to is null or a.job_date <= p_to)
    and a.status <> 'cancelled'
  order by a.job_date, a.pickup_time nulls last, b.reference;
end;
$$;

revoke all on function public.my_driver_jobs(date, date) from public, anon;
grant execute on function public.my_driver_jobs(date, date) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. The dispatch board
--
-- One row per REQUIRED vehicle, not per assignment — `generate_series` over
-- the item's vehicle count. That is the whole point: a board that lists only
-- what has been assigned cannot show what has NOT been, and the empty seat is
-- the thing a dispatcher is looking for.
-- ----------------------------------------------------------------------------

create or replace function public.dispatch_board(p_date date default current_date)
returns table (
  transfer_item_id uuid,
  booking_id       uuid,
  reference        text,
  agency_name      text,
  booking_status   public.booking_status,
  job_date         date,
  pickup_time      time,
  from_name_ar     text,
  from_name_en     text,
  to_name_ar       text,
  to_name_en       text,
  city_ar          text,
  city_en          text,
  direction        public.transfer_direction,
  vehicle_name_ar  text,
  vehicle_name_en  text,
  passengers       smallint,
  flight_number    text,
  vehicle_seq      integer,
  assignment_id    uuid,
  assignment_status public.assignment_status,
  driver_id        uuid,
  driver_name      text,
  driver_phone     text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and not public.has_permission(auth.uid(), 'dispatch.manage') then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  return query
  select ti.id, b.id, b.reference, b.agency_name, b.status,
         ti.transfer_date, ti.pickup_time,
         ti.from_name_ar, ti.from_name_en, ti.to_name_ar, ti.to_name_en,
         ti.city_ar, ti.city_en, ti.direction,
         ti.vehicle_name_ar, ti.vehicle_name_en,
         ti.passengers, ti.flight_number,
         seq.n,
         a.id, a.status, a.driver_id, p.full_name, d.phone
  from public.transfer_items ti
  join public.bookings b on b.id = ti.booking_id
  cross join lateral generate_series(1, ti.vehicles) as seq(n)
  left join public.driver_assignments a
         on a.transfer_item_id = ti.id
        and a.vehicle_seq = seq.n
        and a.status <> 'cancelled'
  left join public.drivers d on d.id = a.driver_id
  left join public.profiles p on p.id = d.profile_id
  where ti.transfer_date = p_date
    and b.status <> 'cancelled'
  order by ti.pickup_time nulls last, b.reference, seq.n;
end;
$$;

revoke all on function public.dispatch_board(date) from public, anon;
grant execute on function public.dispatch_board(date) to authenticated;

-- ----------------------------------------------------------------------------
-- 7. Who is driving — the AGENT's narrow window
--
-- An agent may reasonably tell their customer the driver's name and number.
-- They may not see a licence, an address, or that driver's other jobs — and
-- RLS grants rows rather than columns (§15, Phase 1), so this is a function
-- returning three fields rather than a SELECT policy on `drivers`. Same
-- reasoning as `booking_costs` (§15, 14.1), in the opposite direction.
-- ----------------------------------------------------------------------------

create or replace function public.booking_driver_contacts(p_booking_id uuid)
returns table (
  vehicle_seq  smallint,
  driver_name  text,
  driver_phone text,
  status       public.assignment_status
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_agency uuid;
begin
  if not public.is_active_user() then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  select b.agency_id into v_agency from public.bookings b where b.id = p_booking_id;
  if v_agency is null then
    raise exception 'That booking no longer exists.' using errcode = 'P0002';
  end if;

  -- The same two audiences `bookings_read` allows, restated here because this
  -- function bypasses RLS and must therefore make the decision itself (§12).
  if not (v_agency = public.current_agency_id()
          or (auth.uid() is not null
              and public.has_permission(auth.uid(), 'bookings.view_all'))) then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  return query
  select a.vehicle_seq, p.full_name, d.phone, a.status
  from public.driver_assignments a
  join public.transfer_items ti on ti.id = a.transfer_item_id and ti.booking_id = p_booking_id
  join public.drivers d on d.id = a.driver_id
  join public.profiles p on p.id = d.profile_id
  where a.status <> 'cancelled'
  order by a.vehicle_seq;
end;
$$;

revoke all on function public.booking_driver_contacts(uuid) from public, anon;
grant execute on function public.booking_driver_contacts(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 8. A cancelled booking cancels its jobs
--
-- Without this a driver would keep an aeroplane's arrival on their list for a
-- booking that no longer exists, and would drive to it.
-- ----------------------------------------------------------------------------

create or replace function public.cancel_assignments_with_booking()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    update public.driver_assignments a
       set status = 'cancelled'
      from public.transfer_items ti
     where ti.id = a.transfer_item_id
       and ti.booking_id = new.id
       and a.status not in ('completed', 'cancelled');
  end if;
  return new;
end;
$$;

revoke all on function public.cancel_assignments_with_booking() from public, anon, authenticated;

create trigger bookings_cancel_assignments
  after update of status on public.bookings
  for each row execute function public.cancel_assignments_with_booking();
