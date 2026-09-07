-- ============================================================================
-- Phase 3a — contract rates, cancellation policies, offers and allocation
--
-- The rate master is the part of this schema that has to be exactly right: a
-- night with two applicable prices is not a display bug, it is a booking that
-- charges the wrong amount. Overlap is therefore prevented by the database,
-- not by validation the UI can forget to run.
-- ============================================================================

-- Needed for the EXCLUDE constraint below: btree_gist lets a gist index mix
-- equality columns (uuid) with a range column (daterange).
create extension if not exists btree_gist with schema extensions;

-- --------------------------------------------------------------------- enums

create type public.charge_type as enum ('percentage', 'fixed', 'nights');
create type public.rate_plan_status as enum ('draft', 'active', 'inactive');
create type public.offer_type as enum ('early_bird', 'long_stay', 'free_nights', 'discount');

-- --------------------------------------------------- cancellation policies

create table public.cancellation_policies (
  id            uuid primary key default gen_random_uuid(),
  -- Null = a house policy reusable across every property.
  hotel_id      uuid references public.hotels (id) on delete cascade,

  name_ar       text not null,
  name_en       text not null,
  description_ar text,
  description_en text,

  -- A non-refundable policy carries no rules; the whole booking is forfeit.
  is_non_refundable boolean not null default false,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index cancellation_policies_hotel_idx on public.cancellation_policies (hotel_id);

-- Tiered rules: "free until 14 days before, then 1 night, then 100%".
create table public.cancellation_rules (
  id            uuid primary key default gen_random_uuid(),
  policy_id     uuid not null references public.cancellation_policies (id) on delete cascade,

  -- Hours before check-in at which this tier starts to apply. Hours rather
  -- than days because same-day policies ("free until 18:00") are common and
  -- days cannot express them.
  hours_before_checkin integer not null check (hours_before_checkin >= 0),

  charge_type   public.charge_type not null,
  -- percentage -> 0-100, fixed -> money, nights -> number of nights charged.
  charge_value  numeric(12, 2) not null check (charge_value >= 0),

  created_at    timestamptz not null default now(),

  -- One tier per threshold per policy; two rules at the same hour would be
  -- ambiguous in exactly the way the rate overlap constraint prevents.
  unique (policy_id, hours_before_checkin),

  constraint cancellation_rules_percentage_range
    check (charge_type <> 'percentage' or charge_value <= 100)
);

create index cancellation_rules_policy_idx
  on public.cancellation_rules (policy_id, hours_before_checkin desc);

-- ------------------------------------------------------------- rate plans

-- A rate plan is one commercial contract: a board basis, a currency, a
-- cancellation policy, and a validity window. Rooms are priced within it.
create table public.rate_plans (
  id                uuid primary key default gen_random_uuid(),
  hotel_id          uuid not null references public.hotels (id) on delete cascade,

  code              text not null check (code ~ '^[A-Z0-9_-]{2,20}$'),
  name_ar           text not null,
  name_en           text not null,

  meal_plan_key     text not null references public.meal_plans (key),
  currency_code     char(3) not null default 'EGP',

  cancellation_policy_id uuid references public.cancellation_policies (id) on delete restrict,

  -- Contract validity. Rates outside this window are not sellable even if a
  -- rate row exists, which is what lets an expired contract be kept for
  -- historical bookings without accidentally being sold again.
  valid_from        date not null,
  valid_to          date not null,

  status            public.rate_plan_status not null default 'draft',

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (hotel_id, code),
  constraint rate_plans_valid_window check (valid_to >= valid_from)
);

create index rate_plans_hotel_idx on public.rate_plans (hotel_id, status);

-- ------------------------------------------------------------------- rates

create table public.rates (
  id                uuid primary key default gen_random_uuid(),
  rate_plan_id      uuid not null references public.rate_plans (id) on delete cascade,
  room_type_id      uuid not null references public.room_types (id) on delete cascade,

  -- Half-open [from, to): the standard way to express "these nights". The
  -- upper bound is the morning of departure, so adjacent seasons meet without
  -- overlapping and without a one-day gap.
  stay_period       daterange not null,

  -- Price for `standard_occupancy` guests, per night.
  price_per_night   numeric(12, 2) not null check (price_per_night >= 0),
  -- Charged per guest beyond standard occupancy.
  extra_adult_price numeric(12, 2) not null default 0 check (extra_adult_price >= 0),
  extra_child_price numeric(12, 2) not null default 0 check (extra_child_price >= 0),
  -- Charged when a room is sold to one guest but priced for two.
  single_occupancy_price numeric(12, 2) check (single_occupancy_price >= 0),

  min_stay          smallint not null default 1 check (min_stay >= 1),
  max_stay          smallint check (max_stay is null or max_stay >= min_stay),

  -- Blocks new sales for this period without deleting the contracted price.
  is_closed         boolean not null default false,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint rates_period_not_empty check (not isempty(stay_period)),

  -- THE important constraint. Two rate rows covering the same night for the
  -- same room on the same plan would make the price ambiguous, and whichever
  -- one a query happened to return would decide what the agent is charged.
  -- The database refuses to store that at all.
  constraint rates_no_overlapping_periods
    exclude using gist (
      rate_plan_id with =,
      room_type_id with =,
      stay_period with &&
    )
);

comment on constraint rates_no_overlapping_periods on public.rates is
  'Prevents two prices for the same night. An overlap is a mispriced booking, not a display glitch.';

create index rates_plan_room_idx on public.rates (rate_plan_id, room_type_id);
create index rates_period_idx on public.rates using gist (stay_period);

-- A rate must price a room that belongs to the same hotel as its plan.
create or replace function public.check_rate_room_matches_plan()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_plan_hotel uuid;
  v_room_hotel uuid;
begin
  select hotel_id into v_plan_hotel from public.rate_plans where id = new.rate_plan_id;
  select hotel_id into v_room_hotel from public.room_types where id = new.room_type_id;

  if v_plan_hotel is distinct from v_room_hotel then
    raise exception 'That room type belongs to a different hotel than the rate plan.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.check_rate_room_matches_plan() from public, anon, authenticated;

create trigger rates_room_matches_plan
  before insert or update on public.rates
  for each row execute function public.check_rate_room_matches_plan();

-- ---------------------------------------------------------- child policies

-- How a child is charged, by age band. Held per hotel because it is a property
-- rule, not a contract rule.
create table public.child_policies (
  id            uuid primary key default gen_random_uuid(),
  hotel_id      uuid not null references public.hotels (id) on delete cascade,

  age_from      smallint not null check (age_from >= 0 and age_from <= 17),
  age_to        smallint not null check (age_to >= 0 and age_to <= 17),

  charge_type   public.charge_type not null default 'percentage',
  -- 0 with percentage means the child stays free.
  charge_value  numeric(12, 2) not null default 0 check (charge_value >= 0),

  created_at    timestamptz not null default now(),

  constraint child_policies_age_order check (age_to >= age_from),
  constraint child_policies_percentage_range
    check (charge_type <> 'percentage' or charge_value <= 100),

  -- Overlapping age bands would make a 6-year-old chargeable at two rates.
  constraint child_policies_no_overlapping_ages
    exclude using gist (
      hotel_id with =,
      int4range(age_from, age_to, '[]') with &&
    )
);

create index child_policies_hotel_idx on public.child_policies (hotel_id, age_from);

-- ------------------------------------------------------------------ offers

create table public.offers (
  id                uuid primary key default gen_random_uuid(),
  hotel_id          uuid not null references public.hotels (id) on delete cascade,

  name_ar           text not null,
  name_en           text not null,
  description_ar    text,
  description_en    text,

  offer_type        public.offer_type not null,
  discount_type     public.charge_type not null default 'percentage',
  discount_value    numeric(12, 2) not null check (discount_value >= 0),

  -- When the booking must be made.
  booking_window    daterange,
  -- Which stay dates it applies to.
  stay_window       daterange not null,

  min_nights        smallint check (min_nights is null or min_nights >= 1),
  -- For free_nights offers: stay `min_nights`, pay for (min_nights - free_nights).
  free_nights       smallint check (free_nights is null or free_nights >= 1),

  is_active         boolean not null default true,
  sort_order        integer not null default 0,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint offers_percentage_range
    check (discount_type <> 'percentage' or discount_value <= 100),
  constraint offers_stay_window_not_empty check (not isempty(stay_window)),
  -- A free-nights offer without a minimum stay cannot be evaluated.
  constraint offers_free_nights_needs_min
    check (offer_type <> 'free_nights' or (free_nights is not null and min_nights is not null and min_nights > free_nights))
);

create index offers_hotel_idx on public.offers (hotel_id, is_active);
create index offers_stay_window_idx on public.offers using gist (stay_window);

-- Scope an offer to particular rate plans / room types. No rows = applies to
-- everything in the hotel.
create table public.offer_rate_plans (
  offer_id      uuid not null references public.offers (id) on delete cascade,
  rate_plan_id  uuid not null references public.rate_plans (id) on delete cascade,
  primary key (offer_id, rate_plan_id)
);

create table public.offer_room_types (
  offer_id      uuid not null references public.offers (id) on delete cascade,
  room_type_id  uuid not null references public.room_types (id) on delete cascade,
  primary key (offer_id, room_type_id)
);

-- ------------------------------------------------------------- allocations

-- Sellable rooms per room type per night. One row per date is deliberate: it
-- is what lets a stop-sell or a different allotment apply to a single night,
-- which is how hotel contracts actually work.
create table public.allocations (
  id            uuid primary key default gen_random_uuid(),
  room_type_id  uuid not null references public.room_types (id) on delete cascade,
  stay_date     date not null,

  -- Rooms released to us for this night.
  allotment     integer not null default 0 check (allotment >= 0),
  -- Rooms already sold. Phase 5's booking engine maintains this; nothing in
  -- 3a writes it, so it stays 0 for now rather than being faked.
  sold          integer not null default 0 check (sold >= 0),

  -- Hard block regardless of remaining allotment.
  stop_sell     boolean not null default false,
  -- Per-night override of the rate's min_stay, for peak dates.
  min_stay      smallint check (min_stay is null or min_stay >= 1),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (room_type_id, stay_date),
  -- Overselling is a contractual problem with the hotel, not a warning.
  constraint allocations_not_oversold check (sold <= allotment)
);

create index allocations_room_date_idx on public.allocations (room_type_id, stay_date);
create index allocations_date_idx on public.allocations (stay_date);

comment on column public.allocations.sold is
  'Maintained by the Phase 5 booking engine. Nothing in Phase 3 increments it.';

-- --------------------------------------------------------- updated_at wiring

create trigger cancellation_policies_set_updated_at
  before update on public.cancellation_policies
  for each row execute function public.set_updated_at();

create trigger rate_plans_set_updated_at
  before update on public.rate_plans
  for each row execute function public.set_updated_at();

create trigger rates_set_updated_at
  before update on public.rates
  for each row execute function public.set_updated_at();

create trigger offers_set_updated_at
  before update on public.offers
  for each row execute function public.set_updated_at();

create trigger allocations_set_updated_at
  before update on public.allocations
  for each row execute function public.set_updated_at();

-- --------------------------------------------------------------- enable RLS

alter table public.cancellation_policies enable row level security;
alter table public.cancellation_rules    enable row level security;
alter table public.rate_plans            enable row level security;
alter table public.rates                 enable row level security;
alter table public.child_policies        enable row level security;
alter table public.offers                enable row level security;
alter table public.offer_rate_plans      enable row level security;
alter table public.offer_room_types      enable row level security;
alter table public.allocations           enable row level security;
