-- ============================================================================
-- Phase 3a — hotel inventory: properties, rooms, amenities, media
--
-- This is the internally-managed inventory an admin enters by hand. It sits
-- behind the supplier port added in 3b (CLAUDE.md §9), so nothing here assumes
-- it is the only source of hotels — the search flow in 3c reaches it through
-- the same interface an external supplier will use.
--
-- Bilingual columns follow the pattern already set by `roles`: *_ar / *_en,
-- both required for anything user-facing, because §5 forbids a screen that
-- only works in one language.
-- ============================================================================

-- --------------------------------------------------------------------- enums

create type public.hotel_status as enum ('draft', 'active', 'inactive');

-- `draft` matters: a property is useless until it has rooms and rates, and an
-- admin needs somewhere to build it that is not visible to agents.
comment on type public.hotel_status is
  'draft = being set up, never shown to agents; active = bookable; inactive = withdrawn but kept for booking history.';

create type public.property_type as enum (
  'hotel', 'resort', 'apartment', 'villa', 'guesthouse', 'hostel', 'boutique'
);

create type public.room_status as enum ('active', 'inactive');

-- -------------------------------------------------------------------- hotels

create sequence public.hotel_code_seq start 1;

create table public.hotels (
  id                uuid primary key default gen_random_uuid(),

  -- Human-facing reference used on vouchers and in support conversations.
  code              text not null unique,

  name_ar           text not null check (length(btrim(name_ar)) between 2 and 200),
  name_en           text not null check (length(btrim(name_en)) between 2 and 200),
  description_ar    text,
  description_en    text,

  property_type     public.property_type not null default 'hotel',
  star_rating       smallint check (star_rating between 1 and 7),

  -- Location. Kept as plain columns rather than PostGIS: 3c searches by city
  -- and date, not by radius, and adding a spatial extension for a feature
  -- nothing asks for would be cost without benefit (§11).
  country_code      char(2) not null,
  city_ar           text not null,
  city_en           text not null,
  area_ar           text,
  area_en           text,
  address_ar        text,
  address_en        text,
  latitude          numeric(10, 7) check (latitude between -90 and 90),
  longitude         numeric(10, 7) check (longitude between -180 and 180),

  phone             text,
  email             text,
  website           text,

  check_in_time     time not null default '14:00',
  check_out_time    time not null default '12:00',

  status            public.hotel_status not null default 'draft',

  -- Free-text operational notes for staff. Never shown to an agent.
  internal_notes    text,

  created_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on column public.hotels.internal_notes is
  'Back-office only. Must never be selected into an agent-facing query.';

create index hotels_status_idx on public.hotels (status, created_at desc);
create index hotels_city_idx on public.hotels (country_code, lower(city_en));
create index hotels_name_en_idx on public.hotels (lower(name_en));
create index hotels_name_ar_idx on public.hotels (lower(name_ar));

-- ----------------------------------------------------------------- amenities

-- A seeded reference list rather than free text, so "WiFi" and "Wi-Fi" cannot
-- become two different filters in the 3c search.
create table public.amenities (
  key         text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  category    text not null,
  name_ar     text not null,
  name_en     text not null,
  /** react-icons name, resolved by the UI. */
  icon        text,
  sort_order  integer not null default 0
);

create index amenities_category_idx on public.amenities (category, sort_order);

create table public.hotel_amenities (
  hotel_id     uuid not null references public.hotels (id) on delete cascade,
  amenity_key  text not null references public.amenities (key) on delete cascade,
  primary key (hotel_id, amenity_key)
);

create index hotel_amenities_amenity_idx on public.hotel_amenities (amenity_key);

-- ---------------------------------------------------------------- room types

create table public.room_types (
  id                uuid primary key default gen_random_uuid(),
  hotel_id          uuid not null references public.hotels (id) on delete cascade,

  code              text not null check (code ~ '^[A-Z0-9_-]{2,20}$'),
  name_ar           text not null check (length(btrim(name_ar)) between 2 and 150),
  name_en           text not null check (length(btrim(name_en)) between 2 and 150),
  description_ar    text,
  description_en    text,

  -- ---- occupancy rules -----------------------------------------------------
  -- `standard_occupancy` is the number of guests the nightly rate covers;
  -- anyone beyond it is charged the extra-adult/child price on the rate row.
  -- Keeping the two apart is what lets one room sell at different prices for
  -- two, three and four guests without duplicating the rate.
  standard_occupancy smallint not null default 2 check (standard_occupancy between 1 and 10),
  max_adults         smallint not null default 2 check (max_adults between 1 and 10),
  max_children       smallint not null default 0 check (max_children between 0 and 10),
  max_occupancy      smallint not null check (max_occupancy between 1 and 20),

  size_sqm          smallint check (size_sqm > 0),
  bed_configuration_ar text,
  bed_configuration_en text,

  -- Physical room count. The per-date sellable count lives in `allocations`;
  -- this is the ceiling that allocation can never exceed.
  total_rooms       integer not null default 0 check (total_rooms >= 0),

  status            public.room_status not null default 'active',
  sort_order        integer not null default 0,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (hotel_id, code),

  -- A room that seats fewer people than its own standard rate covers, or fewer
  -- than its adult limit, is a data-entry error that would misprice every
  -- booking made against it.
  constraint room_types_occupancy_coherent
    check (max_occupancy >= standard_occupancy and max_occupancy >= max_adults)
);

create index room_types_hotel_idx on public.room_types (hotel_id, sort_order);

-- --------------------------------------------------------------------- media

-- One table for both property and room photography. `room_type_id` null means
-- the image belongs to the hotel itself; set, it belongs to that room.
create table public.hotel_images (
  id                  uuid primary key default gen_random_uuid(),
  hotel_id            uuid not null references public.hotels (id) on delete cascade,
  room_type_id        uuid references public.room_types (id) on delete cascade,

  -- Cloudinary identifiers (CLAUDE.md §8). We store the delivery URL and the
  -- public_id: the URL so a stored row is renderable on its own, the public_id
  -- so the asset can be deleted from Cloudinary when the row goes.
  cloudinary_public_id text not null,
  secure_url           text not null,
  width                integer,
  height               integer,
  bytes                integer,

  alt_ar              text,
  alt_en              text,

  is_cover            boolean not null default false,
  sort_order          integer not null default 0,

  uploaded_by         uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now()
);

create index hotel_images_hotel_idx on public.hotel_images (hotel_id, sort_order);
create index hotel_images_room_idx on public.hotel_images (room_type_id) where room_type_id is not null;

-- Exactly one cover per hotel, and one per room type. A partial unique index
-- expresses that without needing a trigger.
create unique index hotel_images_one_hotel_cover
  on public.hotel_images (hotel_id)
  where is_cover and room_type_id is null;

create unique index hotel_images_one_room_cover
  on public.hotel_images (room_type_id)
  where is_cover and room_type_id is not null;

-- A room image must belong to a room of the same hotel. Without this, a room
-- from hotel A could be illustrated with a photo filed under hotel B.
create or replace function public.check_image_room_belongs_to_hotel()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.room_type_id is not null
     and not exists (
       select 1 from public.room_types
       where id = new.room_type_id and hotel_id = new.hotel_id
     ) then
    raise exception 'That room type does not belong to this hotel.' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.check_image_room_belongs_to_hotel() from public, anon, authenticated;

create trigger hotel_images_room_matches_hotel
  before insert or update on public.hotel_images
  for each row execute function public.check_image_room_belongs_to_hotel();

-- ---------------------------------------------------------------- meal plans

-- Industry-standard board basis codes. Seeded, not user-created: these appear
-- on vouchers and in supplier mappings, so the set has to be stable.
create table public.meal_plans (
  key         text primary key check (key ~ '^[A-Z]{2,4}$'),
  name_ar     text not null,
  name_en     text not null,
  description_ar text,
  description_en text,
  sort_order  integer not null default 0
);

-- --------------------------------------------------------- updated_at wiring

create trigger hotels_set_updated_at
  before update on public.hotels
  for each row execute function public.set_updated_at();

create trigger room_types_set_updated_at
  before update on public.room_types
  for each row execute function public.set_updated_at();

-- --------------------------------------------------------------- enable RLS

alter table public.hotels          enable row level security;
alter table public.amenities       enable row level security;
alter table public.hotel_amenities enable row level security;
alter table public.room_types      enable row level security;
alter table public.hotel_images    enable row level security;
alter table public.meal_plans      enable row level security;
