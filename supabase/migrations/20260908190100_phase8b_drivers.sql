-- ============================================================================
-- Phase 8b — driver operations: people, assignments, access
--
-- A transfer booked in Phase 8a says WHAT was sold. This says WHO is driving,
-- which vehicle of the several a booking may have, and where that job has got
-- to. It is the first part of the system whose users are neither back-office
-- staff nor agents.
--
-- The load-bearing decision, chosen by the client: ONE ASSIGNMENT ROW PER
-- VEHICLE. A booking for three cars is three jobs, three drivers and three
-- independent states — because that is what happens on the day, and because a
-- single status cannot say "one car has arrived and one is stuck in traffic".
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Permissions
--
-- Two keys, not one. Hiring and off-boarding a driver is an HR-shaped act;
-- deciding who drives tonight is an operations-shaped one, and in a real
-- office those are different people (§7: permissions are named acts, not CRUD).
-- ----------------------------------------------------------------------------

insert into public.permissions (key, module, name_ar, name_en, description_ar, description_en)
values
  ('drivers.manage', 'drivers', 'إدارة السائقين', 'Manage drivers',
   'إضافة السائقين وتعديل بياناتهم وتفعيلهم أو إيقافهم.',
   'Add drivers, edit their details, activate or deactivate them.'),
  ('dispatch.manage', 'drivers', 'توزيع المهام', 'Dispatch jobs',
   'إسناد السائقين إلى مهام النقل ومتابعة حالتها.',
   'Assign drivers to transfer jobs and follow their status.')
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- 2. The driver system role
--
-- `is_system` is a flag rather than a hardcoded list of keys, so a fifth
-- protected role is data — no constraint changes. It is protected for the same
-- reason the other four are: code refers to the scope by name, and a deleted
-- role would leave every driver account pointing at nothing.
-- ----------------------------------------------------------------------------

insert into public.roles (key, scope, name_ar, name_en, description_ar, description_en, is_system)
values
  ('driver', 'driver',
   'سائق', 'Driver',
   'سائق ينفّذ مهام النقل ويرى مهامه فقط، بدون أي أسعار.',
   'A driver who carries out transfer jobs and sees only their own jobs, with no prices.',
   true)
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- 3. Drivers
-- ----------------------------------------------------------------------------

create table public.drivers (
  id            uuid primary key default gen_random_uuid(),

  -- A driver IS a platform user: they sign in and see their own jobs. The
  -- separate table exists because licence details and availability are
  -- operational data that has no business on `profiles`, which agents and
  -- staff share.
  profile_id    uuid not null unique references public.profiles (id) on delete cascade,

  code          text not null unique check (code ~ '^[A-Z][A-Z0-9_-]{1,20}$'),

  -- Duplicated from `profiles.phone` deliberately: the dispatcher must always
  -- have a number to ring, and `profiles.phone` is optional and owned by the
  -- user. This one is required and owned by operations.
  phone         text not null check (length(btrim(phone)) between 6 and 40),

  licence_number text,
  licence_expiry date,

  -- What they normally drive. Not a constraint on what they CAN be given —
  -- dispatch overrides it every day — so it is a default, and named one.
  default_vehicle_type_id uuid references public.vehicle_types (id) on delete set null,

  is_active     boolean not null default true,
  notes         text check (notes is null or length(notes) <= 1000),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.drivers is
  'Operational record for a driver. The person is a row in profiles with a driver-scoped role; this is what dispatch needs to know about them.';

create index drivers_active_idx on public.drivers (is_active) where is_active;

create trigger drivers_set_updated_at
  before update on public.drivers
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 4. Assignments — one per vehicle
-- ----------------------------------------------------------------------------

create type public.assignment_status as enum (
  'assigned',    -- dispatch has given it to a driver
  'en_route',    -- the driver is on the way to the pickup
  'arrived',     -- the driver is at the pickup point
  'picked_up',   -- the passengers are aboard
  'completed',   -- delivered
  'no_show',     -- the driver waited and nobody came
  'cancelled'    -- the job went away (booking cancelled, or dispatch pulled it)
);

create table public.driver_assignments (
  id              uuid primary key default gen_random_uuid(),

  transfer_item_id uuid not null references public.transfer_items (id) on delete cascade,
  -- `restrict`, not `cascade`: a driver with history is deactivated, never
  -- deleted, exactly as agencies and profiles are (§15, 2.8).
  driver_id       uuid not null references public.drivers (id) on delete restrict,

  -- Which of the booking's vehicles this is. 1..N where N is the item's
  -- `vehicles` count — enforced by the trigger below, because a CHECK cannot
  -- see another table.
  vehicle_seq     smallint not null check (vehicle_seq between 1 and 20),

  status          public.assignment_status not null default 'assigned',

  -- Denormalised from the transfer item so a driver's "my day" query needs no
  -- join and the clash index below is possible at all. Safe to copy because a
  -- transfer item is immutable once booked: there is no UPDATE policy on it,
  -- and nothing in the codebase writes one.
  job_date        date not null,
  pickup_time     time,

  assigned_at     timestamptz not null default now(),
  assigned_by     uuid references auth.users (id) on delete set null,
  started_at      timestamptz,
  arrived_at      timestamptz,
  picked_up_at    timestamptz,
  completed_at    timestamptz,

  -- What the driver reports back — a wrong terminal, a phone that was off.
  driver_notes    text check (driver_notes is null or length(driver_notes) <= 1000),

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()

  -- Uniqueness is enforced by PARTIAL indexes below rather than constraints
  -- here: a pulled job keeps its row as history, and a table constraint would
  -- let that dead row go on blocking the seat it no longer occupies.
);

comment on table public.driver_assignments is
  'One row per vehicle on a transfer. Three cars is three rows with three independent states, because that is what the day actually looks like.';

comment on column public.driver_assignments.job_date is
  'Copied from transfer_items.transfer_date. A transfer item is immutable once booked, so this cannot drift.';

-- One driver per vehicle, and one vehicle per driver on a given leg — both
-- ignoring cancelled rows, so pulling a driver frees the seat for the next one
-- without erasing the fact that the first was ever assigned.
create unique index driver_assignments_one_per_vehicle
  on public.driver_assignments (transfer_item_id, vehicle_seq)
  where status <> 'cancelled';

create unique index driver_assignments_one_car_each
  on public.driver_assignments (transfer_item_id, driver_id)
  where status <> 'cancelled';

create index driver_assignments_driver_day_idx
  on public.driver_assignments (driver_id, job_date);
create index driver_assignments_item_idx
  on public.driver_assignments (transfer_item_id);

-- A driver cannot be in two places at the same minute.
--
-- Deliberately an EXACT clash only. A real dispatcher also cares about travel
-- time between two jobs an hour apart, but any window this migration picked
-- would be a business rule nobody stated (§2.6 by analogy). What is certain is
-- that the same driver at the same time on the same day is a double-booking.
create unique index driver_assignments_no_clash
  on public.driver_assignments (driver_id, job_date, pickup_time)
  where pickup_time is not null and status <> 'cancelled';

create trigger driver_assignments_set_updated_at
  before update on public.driver_assignments
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 5. The vehicle sequence must fit the booking it belongs to
-- ----------------------------------------------------------------------------

create or replace function public.check_assignment_vehicle_seq()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_vehicles smallint;
  v_date     date;
  v_time     time;
begin
  select ti.vehicles, ti.transfer_date, ti.pickup_time
    into v_vehicles, v_date, v_time
  from public.transfer_items ti
  where ti.id = new.transfer_item_id;

  if v_vehicles is null then
    raise exception 'That transfer no longer exists.' using errcode = 'P0002';
  end if;

  if new.vehicle_seq > v_vehicles then
    raise exception 'This booking has only % vehicle(s).', v_vehicles using errcode = '22023';
  end if;

  -- The date and time are the item's, never the caller's: they are what the
  -- clash index is built on, so letting them be passed in would let a caller
  -- sidestep it.
  new.job_date := v_date;
  new.pickup_time := v_time;

  return new;
end;
$$;

revoke all on function public.check_assignment_vehicle_seq() from public, anon, authenticated;

create trigger driver_assignments_check_seq
  before insert or update of transfer_item_id, vehicle_seq on public.driver_assignments
  for each row execute function public.check_assignment_vehicle_seq();

-- ----------------------------------------------------------------------------
-- 6. RLS
--
-- Reads only. Every write goes through an RPC in the next migration, for the
-- same reason bookings do (§15, 10.5): the state machine, the clash rule and
-- the "is this driver allowed to touch this job" question have to be decided
-- in one place that a client cannot reach around.
--
-- Policies call only authorize() / current_agency_id() / current_role_id() /
-- is_active_user() — the four the caller may execute (§15, Phase 4). The
-- "am I this driver" test is a plain subquery on `drivers`, which has its own
-- self-read policy, so no new function is needed.
-- ----------------------------------------------------------------------------

alter table public.drivers            enable row level security;
alter table public.driver_assignments enable row level security;

create policy drivers_self_read
  on public.drivers for select
  to authenticated
  using (profile_id = auth.uid());

create policy drivers_staff_read
  on public.drivers for select
  to authenticated
  using (public.authorize('drivers.manage') or public.authorize('dispatch.manage'));

create policy drivers_manage
  on public.drivers for all
  to authenticated
  using (public.authorize('drivers.manage'))
  with check (public.authorize('drivers.manage'));

create policy driver_assignments_self_read
  on public.driver_assignments for select
  to authenticated
  using (
    exists (
      select 1 from public.drivers d
      where d.id = driver_id and d.profile_id = auth.uid()
    )
  );

create policy driver_assignments_staff_read
  on public.driver_assignments for select
  to authenticated
  using (public.authorize('dispatch.manage') or public.authorize('bookings.view_all'));

-- Agents get NOTHING here, not even on their own booking. `drivers` carries a
-- licence number and a personal phone, and RLS grants rows rather than columns
-- (§15, Phase 1) — so "the agent may see who is driving" is answered by a
-- function that returns two fields, not by a policy that hands over the row.
-- That function is in the next migration.
