-- ============================================================================
-- Phase 8c — packages and tours
--
-- Two decisions taken by the client before this was written, because §13 names
-- the module and says nothing about how a package is composed or priced:
--
--   1. A package is a FIXED TOUR with dated departures, each with its own
--      capacity — not a dynamic bundle assembled from live hotel and transfer
--      inventory. Components may be recorded for COST only, so the Phase 7
--      margin reports keep working.
--   2. Pricing is PER PERSON BY OCCUPANCY — per person sharing a double, a
--      single supplement, a triple rate, a child rate. A flat per-booking
--      price cannot express a single supplement, which is the one number every
--      tour quote has.
--
-- The booking itself is a row in `bookings`, as a transfer is (§15, 15.1).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Permissions
-- ----------------------------------------------------------------------------

insert into public.permissions (key, module, name_ar, name_en, description_ar, description_en)
values
  ('packages.view', 'packages', 'عرض الباقات', 'View packages',
   'الاطلاع على الباقات وبرامجها وأسعارها.', 'See packages, itineraries and rates.'),
  ('packages.manage', 'packages', 'إدارة الباقات', 'Manage packages',
   'إضافة وتعديل الباقات والبرامج والمغادرات والأسعار.',
   'Add and edit packages, itineraries, departures and rates.')
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- 2. Dates for the third product
--
-- A package runs like a stay: a first day, a last day, and nights between. The
-- only difference from a hotel is length — a Nile cruise plus Cairo can run
-- past the 30-night ceiling that made sense for a hotel booking.
-- ----------------------------------------------------------------------------

alter table public.bookings drop constraint bookings_dates_by_product;

alter table public.bookings
  add constraint bookings_dates_by_product check (
    case product_type
      when 'hotel' then check_out > check_in and nights = check_out - check_in
                        and nights between 1 and 30
      when 'transfer' then check_out = check_in and nights = 0
      when 'package' then check_out > check_in and nights = check_out - check_in
                          and nights between 1 and 60
    end
  );

comment on column public.bookings.rooms is
  'How many units: rooms for a hotel booking, vehicles for a transfer, travellers for a package.';

-- ----------------------------------------------------------------------------
-- 3. The package
-- ----------------------------------------------------------------------------

create type public.package_status as enum ('draft', 'active', 'archived');

create table public.packages (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique check (code ~ '^[A-Z][A-Z0-9_-]{1,30}$'),

  name_ar       text not null,
  name_en       text not null,
  summary_ar    text,
  summary_en    text,

  country_code  char(2) not null,
  city_ar       text not null,
  city_en       text not null,

  -- Nights is the load-bearing one: it decides the return date of every
  -- departure, and therefore what the booking's check_out will be.
  duration_nights smallint not null check (duration_nights between 1 and 60),

  -- Plain text rendered as paragraphs, never HTML. A non-developer edits these
  -- and an unescaped CMS field is a stored-XSS hole waiting for its first
  -- editor (§15, 9.2).
  inclusions_ar text,
  inclusions_en text,
  exclusions_ar text,
  exclusions_en text,

  cover_image_public_id text,

  status        public.package_status not null default 'draft',

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.packages is
  'A fixed tour sold at a contracted per-person price. Departures carry the dates and the seats; rates carry the money.';

create index packages_active_idx on public.packages (country_code, city_en)
  where status = 'active';

create trigger packages_set_updated_at
  before update on public.packages
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 4. The itinerary
-- ----------------------------------------------------------------------------

create table public.package_days (
  id          uuid primary key default gen_random_uuid(),
  package_id  uuid not null references public.packages (id) on delete cascade,

  day_number  smallint not null check (day_number between 1 and 61),
  title_ar    text not null,
  title_en    text not null,
  body_ar     text,
  body_en     text,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint package_days_one_per_day unique (package_id, day_number)
);

create trigger package_days_set_updated_at
  before update on public.package_days
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 5. Rates — per person, by occupancy
--
-- Modelled on hotel rates (§15, 6.2/6.3): a `daterange` per occupancy with an
-- EXCLUDE constraint, so two rates can never cover the same departure date for
-- the same occupancy. An overlap is not a display bug, it is a tour sold at
-- whichever price a query happened to return first.
--
-- The period is matched against the DEPARTURE date, not every night of the
-- tour: a tour is priced by when it leaves.
-- ----------------------------------------------------------------------------

create type public.package_occupancy as enum ('single', 'double', 'triple', 'child');

comment on type public.package_occupancy is
  'Per-person basis: `double` is one person sharing a twin/double, `single` is sole occupancy (the supplement is the gap between them), `child` is a child sharing with adults.';

create table public.package_rates (
  id            uuid primary key default gen_random_uuid(),
  package_id    uuid not null references public.packages (id) on delete cascade,

  occupancy     public.package_occupancy not null,

  -- Contracted NET per person. Never shown to an agent (§15, 6.1) — there is
  -- no agent-facing SELECT policy on this table at all.
  net_per_person numeric(14, 2) not null check (net_per_person >= 0),
  currency_code char(3) not null default 'EGP',

  -- Half-open, as every other date range in this schema is (§15, 6.3): the
  -- admin enters the first and LAST departure day, the database stores
  -- [from, to+1).
  valid_period  daterange not null,

  is_closed     boolean not null default false,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint package_rates_no_overlap
    exclude using gist (package_id with =, occupancy with =, valid_period with &&)
);

create index package_rates_lookup_idx on public.package_rates (package_id, occupancy);

create trigger package_rates_set_updated_at
  before update on public.package_rates
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 6. Departures — the dates and the seats
--
-- A departure is where capacity lives, and it is a real constraint: a coach
-- and a guide hold a fixed number of people, unlike a transfer where the
-- operator sends another car (§15, 15.3). So this DOES have the oversell check
-- that transfers deliberately do not.
-- ----------------------------------------------------------------------------

create table public.package_departures (
  id             uuid primary key default gen_random_uuid(),
  package_id     uuid not null references public.packages (id) on delete cascade,

  departure_date date not null,
  -- Stored rather than derived so a booking's check_out can be read straight
  -- off it, and kept honest by the trigger below.
  return_date    date not null,

  capacity       smallint not null check (capacity between 1 and 500),
  -- Held at booking CREATION, exactly as hotel allotment is (§15, 10.4):
  -- otherwise two agents both take the last seat while their bookings sit
  -- pending.
  seats_sold     smallint not null default 0 check (seats_sold >= 0),

  -- A departure that will not run: below minimum numbers, or simply closed.
  is_closed      boolean not null default false,

  notes          text,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint package_departures_no_oversell check (seats_sold <= capacity),
  constraint package_departures_one_per_date unique (package_id, departure_date)
);

create index package_departures_date_idx
  on public.package_departures (departure_date) where not is_closed;

create trigger package_departures_set_updated_at
  before update on public.package_departures
  for each row execute function public.set_updated_at();

/**
 * The return date is the package's own length, not a number someone typed.
 *
 * Letting it be entered by hand would let a departure disagree with the tour
 * it belongs to, and the booking's `nights = check_out - check_in` constraint
 * would then reject the booking rather than the bad data.
 */
create or replace function public.set_departure_return_date()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_nights smallint;
begin
  select duration_nights into v_nights from public.packages where id = new.package_id;
  if v_nights is null then
    raise exception 'That package no longer exists.' using errcode = 'P0002';
  end if;
  new.return_date := new.departure_date + v_nights;
  return new;
end;
$$;

revoke all on function public.set_departure_return_date() from public, anon, authenticated;

create trigger package_departures_set_return_date
  before insert or update of departure_date, package_id on public.package_departures
  for each row execute function public.set_departure_return_date();

-- ----------------------------------------------------------------------------
-- 7. The booking item — one row per occupancy line
--
-- "2 people sharing a double, 1 single" is two lines, because that is how the
-- invoice reads and how the money adds up. Everything is a SNAPSHOT, for the
-- same reason every other item in this system is one (§15, 9.4): a voucher
-- issued today must still read correctly after the tour is renamed or
-- re-priced.
-- ----------------------------------------------------------------------------

create table public.package_items (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid not null references public.bookings (id) on delete cascade,

  package_id      uuid references public.packages (id) on delete set null,
  departure_id    uuid references public.package_departures (id) on delete set null,

  package_code    text not null,
  name_ar         text not null,
  name_en         text not null,
  city_ar         text,
  city_en         text,
  country_code    char(2),
  duration_nights smallint not null,

  departure_date  date not null,
  return_date     date not null,

  occupancy       public.package_occupancy not null,
  travellers      smallint not null check (travellers between 1 and 100),

  currency_code   char(3) not null,
  sell_per_person numeric(14, 2) not null check (sell_per_person >= 0),
  sell_total      numeric(14, 2) not null check (sell_total >= 0),

  created_at      timestamptz not null default now(),

  -- One line per occupancy on a booking; two "single" lines would be a bug in
  -- the caller, not a thing a tour can have.
  constraint package_items_one_per_occupancy unique (booking_id, occupancy)
);

create index package_items_booking_idx on public.package_items (booking_id);
create index package_items_departure_idx on public.package_items (departure_id);

-- ----------------------------------------------------------------------------
-- 8. RLS
--
-- The split is the one this project has used since Phase 3a (§15, 6.1):
-- descriptive things are readable, CONTRACTED PRICES are not. An agent needs
-- the itinerary to sell the tour and the departure to pick a date; the net
-- per person is the client's margin and has no agent-facing policy at all.
--
-- Policies call only authorize() / current_agency_id() / current_role_id() /
-- is_active_user() — the four the caller may execute (§15, Phase 4).
-- ----------------------------------------------------------------------------

alter table public.packages           enable row level security;
alter table public.package_days       enable row level security;
alter table public.package_rates      enable row level security;
alter table public.package_departures enable row level security;
alter table public.package_items      enable row level security;

-- Active packages are what an agent sells; drafts are not.
create policy packages_read_active
  on public.packages for select
  to authenticated
  using (status = 'active' and public.is_active_user());

create policy packages_read_manager
  on public.packages for select
  to authenticated
  using (public.authorize('packages.view') or public.authorize('packages.manage'));

create policy packages_write
  on public.packages for all
  to authenticated
  using (public.authorize('packages.manage'))
  with check (public.authorize('packages.manage'));

create policy package_days_read
  on public.package_days for select
  to authenticated
  using (
    public.is_active_user()
    and exists (
      select 1 from public.packages p
      where p.id = package_id
        and (p.status = 'active' or public.authorize('packages.view')
             or public.authorize('packages.manage'))
    )
  );

create policy package_days_write
  on public.package_days for all
  to authenticated
  using (public.authorize('packages.manage'))
  with check (public.authorize('packages.manage'));

create policy package_departures_read
  on public.package_departures for select
  to authenticated
  using (
    public.is_active_user()
    and exists (
      select 1 from public.packages p
      where p.id = package_id
        and (p.status = 'active' or public.authorize('packages.view')
             or public.authorize('packages.manage'))
    )
  );

create policy package_departures_write
  on public.package_departures for all
  to authenticated
  using (public.authorize('packages.manage'))
  with check (public.authorize('packages.manage'));

-- Rates: management only. No agent-facing SELECT policy, deliberately.
create policy package_rates_manage
  on public.package_rates for all
  to authenticated
  using (public.authorize('packages.manage'))
  with check (public.authorize('packages.manage'));

create policy package_items_read
  on public.package_items for select
  to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and ((b.agency_id = public.current_agency_id() and public.is_active_user())
             or public.authorize('bookings.view_all'))
    )
  );

-- No write policy: create_package_booking() writes it, as the owner.
