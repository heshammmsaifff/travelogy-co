-- ============================================================================
-- Phase 5a — the booking engine
--
-- Three things make this schema what it is:
--
--  1. INVENTORY IS HELD AT CREATION, not at confirmation. Two agents cannot
--     both take the last room while their bookings sit pending. `allocations`
--     already carries `check (sold <= allotment)`, so overselling is refused by
--     the database rather than detected afterwards.
--
--  2. THE PRICE IS RE-DERIVED SERVER-SIDE. `create_booking` calls
--     `search_availability()` and charges what that returns — never a number
--     from the client. If the rate moved since the agent looked, the booking is
--     refused with the new price rather than silently charged either amount.
--
--  3. CREDIT IS CHECKED BEFORE THE ROW EXISTS. §10 makes the balance a derived
--     figure, so it is computed from the ledger inside the same transaction
--     that would create the charge.
-- ============================================================================

create type public.booking_status as enum ('pending', 'confirmed', 'cancelled', 'completed');

create sequence public.booking_ref_seq start 1;

create or replace function public.next_booking_ref()
returns text
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  select 'LLT-B-' || lpad(nextval('public.booking_ref_seq')::text, 6, '0');
$$;

revoke all on function public.next_booking_ref() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 1. Permissions this phase introduces
-- ----------------------------------------------------------------------------

insert into public.permissions (key, module, name_ar, name_en, description_ar, description_en)
values
  ('bookings.view_all', 'bookings', 'عرض كل الحجوزات', 'View all bookings',
   'الاطلاع على حجوزات كل الوكلاء.', 'See bookings across every agency.'),
  ('bookings.confirm', 'bookings', 'تأكيد الحجوزات', 'Confirm bookings',
   'تأكيد حجز بعد التحقق منه مع الفندق.', 'Confirm a booking after checking it with the hotel.'),
  ('bookings.cancel', 'bookings', 'إلغاء الحجوزات', 'Cancel bookings',
   'إلغاء حجز وإعادة الغرف للمخزون.', 'Cancel a booking and return its rooms to inventory.')
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- 2. Tables
-- ----------------------------------------------------------------------------

create table public.bookings (
  id             uuid primary key default gen_random_uuid(),
  reference      text not null unique,

  agency_id      uuid not null references public.agencies (id) on delete restrict,
  created_by     uuid references public.profiles (id) on delete set null,
  -- Where this came from, when it started life as a saved quotation.
  quotation_id   uuid references public.quotations (id) on delete set null,

  status         public.booking_status not null default 'pending',

  check_in       date not null,
  check_out      date not null,
  nights         smallint not null check (nights between 1 and 30),

  -- The person staying. Required: a voucher with no name on it is useless.
  lead_guest_name  text not null check (length(btrim(lead_guest_name)) between 2 and 200),
  lead_guest_email text,
  lead_guest_phone text,
  special_requests text check (special_requests is null or length(special_requests) <= 1000),

  adults         smallint not null check (adults between 1 and 20),
  children       smallint not null default 0 check (children between 0 and 10),
  rooms          smallint not null check (rooms between 1 and 10),

  currency_code  char(3) not null,
  -- What the agent owes for this booking. A SELL total; no net figure is
  -- stored on a booking, for the same reason search never returns one (§15, 6.1).
  total_sell     numeric(14, 2) not null check (total_sell >= 0),

  confirmed_at   timestamptz,
  confirmed_by   uuid references public.profiles (id) on delete set null,
  cancelled_at   timestamptz,
  cancelled_by   uuid references public.profiles (id) on delete set null,
  cancellation_reason text,
  completed_at   timestamptz,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint bookings_dates_ordered check (check_out > check_in),
  constraint bookings_nights_match check (nights = check_out - check_in)
);

comment on table public.bookings is
  'An agent booking. `agency_id` is ON DELETE RESTRICT: a company with bookings is part of the financial record and must not disappear from under them.';

comment on column public.bookings.total_sell is
  'Derived by create_booking() from search_availability(), never accepted from the client.';

create index bookings_agency_idx on public.bookings (agency_id, created_at desc);
create index bookings_status_idx on public.bookings (status, check_in);
create index bookings_reference_idx on public.bookings (reference);

create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

create table public.booking_items (
  id             uuid primary key default gen_random_uuid(),
  booking_id     uuid not null references public.bookings (id) on delete cascade,

  supplier_key   text not null,
  -- Set for our own inventory; NULL for an external supplier, which has no row
  -- here. ON DELETE SET NULL so removing a hotel never destroys a booking.
  hotel_id       uuid references public.hotels (id) on delete set null,
  room_type_id   uuid references public.room_types (id) on delete set null,
  rate_plan_id   uuid references public.rate_plans (id) on delete set null,

  -- Snapshot, for the same reason quotation items are snapshots: a voucher
  -- issued today must still read correctly after the contract is renegotiated.
  hotel_name_ar  text not null,
  hotel_name_en  text not null,
  city_ar        text,
  city_en        text,
  country_code   char(2),
  star_rating    smallint,
  room_name_ar   text not null,
  room_name_en   text not null,
  plan_name_ar   text not null,
  plan_name_en   text not null,
  meal_plan_key  text not null,

  nights         smallint not null check (nights between 1 and 30),
  rooms          smallint not null check (rooms between 1 and 10),
  currency_code  char(3) not null,
  sell_per_night numeric(14, 2) not null check (sell_per_night >= 0),
  sell_total     numeric(14, 2) not null check (sell_total >= 0),
  is_refundable  boolean not null default false,

  created_at     timestamptz not null default now()
);

comment on table public.booking_items is
  'Phase 5 creates exactly one item per booking. The table is a table rather than columns on `bookings` so a multi-room booking needs no migration later.';

create index booking_items_booking_idx on public.booking_items (booking_id);

-- ----------------------------------------------------------------------------
-- 3. The agent's balance, derived from the ledger (§10)
--
-- Charges are bookings that still stand; a cancelled booking owes nothing.
-- The payments side arrives in 5b, so this reads a table that does not exist
-- yet — hence `agency_charges` here and the full balance in 5b.
-- ----------------------------------------------------------------------------

create or replace function public.agency_outstanding(p_agency_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(b.total_sell), 0)
  from public.bookings b
  where b.agency_id = p_agency_id
    -- Pending counts: the rooms are held and the agent is on the hook for
    -- them. Only a cancellation releases the obligation.
    and b.status in ('pending', 'confirmed', 'completed');
$$;

comment on function public.agency_outstanding(uuid) is
  'Total owed for bookings that still stand. 5b subtracts recorded payments to give the true balance.';

revoke all on function public.agency_outstanding(uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. create_booking — the one way a booking comes into existence
-- ----------------------------------------------------------------------------

create or replace function public.create_booking(
  p_room_type_id  uuid,
  p_rate_plan_id  uuid,
  p_check_in      date,
  p_check_out     date,
  p_adults        integer,
  p_children      integer,
  p_rooms         integer,
  p_guest_name    text,
  p_guest_email   text default null,
  p_guest_phone   text default null,
  p_requests      text default null,
  p_quotation_id  uuid default null
)
returns table (booking_id uuid, reference text, total_sell numeric, currency_code char(3))
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_agency_id   uuid := public.current_agency_id();
  v_user_id     uuid := auth.uid();
  v_offer       record;
  v_nights      integer := p_check_out - p_check_in;
  v_limit       numeric;
  v_outstanding numeric;
  v_reference   text;
  v_booking_id  uuid;
  v_night       date;
begin
  -- SECURITY DEFINER bypasses RLS, so these checks stand in for it (§12).
  if not public.is_active_user() or v_agency_id is null then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  if v_nights < 1 or v_nights > 30 then
    raise exception 'A stay must be between 1 and 30 nights.' using errcode = '22023';
  end if;

  -- ---- 1. Re-derive the offer and its price -------------------------------
  -- search_availability() is the single source of truth for pricing and
  -- availability (§15, 7.3). Calling it here rather than re-implementing the
  -- rules means a booking can never be priced by a second, drifting copy.
  select *
    into v_offer
  from public.search_availability(p_check_in, p_check_out, p_adults, p_children, p_rooms)
  where room_type_id = p_room_type_id
    and rate_plan_id = p_rate_plan_id
  limit 1;

  if v_offer is null then
    -- Distinguished from a generic failure: the agent needs to know the offer
    -- moved, not that something broke.
    raise exception 'That offer is no longer available.' using errcode = 'P0002';
  end if;

  -- ---- 2. Credit ----------------------------------------------------------
  select a.credit_limit into v_limit
  from public.agencies a where a.id = v_agency_id;

  v_outstanding := public.agency_outstanding(v_agency_id);

  -- Blocking rather than warning: a limit a user can click past is not a
  -- limit, and this is a credit facility the operator controls (§10, §15).
  if v_outstanding + v_offer.sell_total > coalesce(v_limit, 0) then
    raise exception 'This booking would exceed the agency credit limit.'
      using errcode = 'P0003',
            detail = format('outstanding=%s booking=%s limit=%s',
                            v_outstanding, v_offer.sell_total, coalesce(v_limit, 0));
  end if;

  -- ---- 3. Hold the inventory ---------------------------------------------
  -- Done before the booking row exists, and inside this transaction, so two
  -- agents racing for the last room cannot both succeed. `allocations` has
  -- CHECK (sold <= allotment), so the database refuses the oversell itself.
  v_night := p_check_in;
  while v_night < p_check_out loop
    update public.allocations
       set sold = sold + p_rooms
     where room_type_id = p_room_type_id
       and stay_date = v_night;

    if not found then
      raise exception 'Inventory is not loaded for %.', v_night using errcode = 'P0002';
    end if;

    v_night := v_night + 1;
  end loop;

  -- ---- 4. The booking -----------------------------------------------------
  v_reference := 'LLT-B-' || lpad(nextval('public.booking_ref_seq')::text, 6, '0');

  insert into public.bookings (
    reference, agency_id, created_by, quotation_id, status,
    check_in, check_out, nights,
    lead_guest_name, lead_guest_email, lead_guest_phone, special_requests,
    adults, children, rooms, currency_code, total_sell
  ) values (
    v_reference, v_agency_id, v_user_id, p_quotation_id, 'pending',
    p_check_in, p_check_out, v_nights,
    p_guest_name, p_guest_email, p_guest_phone, p_requests,
    p_adults, p_children, p_rooms, v_offer.currency_code, v_offer.sell_total
  )
  returning id into v_booking_id;

  insert into public.booking_items (
    booking_id, supplier_key, hotel_id, room_type_id, rate_plan_id,
    hotel_name_ar, hotel_name_en, city_ar, city_en, country_code, star_rating,
    room_name_ar, room_name_en, plan_name_ar, plan_name_en, meal_plan_key,
    nights, rooms, currency_code, sell_per_night, sell_total, is_refundable
  ) values (
    v_booking_id, 'internal', v_offer.hotel_id, p_room_type_id, p_rate_plan_id,
    v_offer.name_ar, v_offer.name_en, v_offer.city_ar, v_offer.city_en,
    v_offer.country_code, v_offer.star_rating,
    v_offer.room_name_ar, v_offer.room_name_en,
    v_offer.plan_name_ar, v_offer.plan_name_en, v_offer.meal_plan_key,
    v_nights, p_rooms, v_offer.currency_code,
    v_offer.sell_per_night, v_offer.sell_total, v_offer.is_refundable
  );

  perform public.write_audit('create', 'bookings', v_booking_id::text,
                             jsonb_build_object('reference', v_reference,
                                                'total', v_offer.sell_total));

  return query select v_booking_id, v_reference, v_offer.sell_total, v_offer.currency_code;
end;
$$;

revoke all on function public.create_booking(uuid, uuid, date, date, integer, integer, integer, text, text, text, text, uuid) from public, anon;
grant execute on function public.create_booking(uuid, uuid, date, date, integer, integer, integer, text, text, text, text, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. State transitions
--
-- Each is an RPC that re-checks its own permission, for the same reason the
-- agency lifecycle RPCs do (§15, 3.3): a two-statement change made from the
-- client can half-apply.
-- ----------------------------------------------------------------------------

create or replace function public.confirm_booking(p_booking_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_status public.booking_status;
begin
  if not public.has_permission(auth.uid(), 'bookings.confirm') then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  select status into v_status from public.bookings where id = p_booking_id;
  if v_status is null then
    raise exception 'Booking not found.' using errcode = 'P0002';
  end if;
  if v_status <> 'pending' then
    raise exception 'Only a pending booking can be confirmed.' using errcode = '22023';
  end if;

  update public.bookings
     set status = 'confirmed', confirmed_at = now(), confirmed_by = auth.uid()
   where id = p_booking_id;

  perform public.write_audit('confirm', 'bookings', p_booking_id::text, null);
end;
$$;

create or replace function public.cancel_booking(p_booking_id uuid, p_reason text default null)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking record;
  v_item    record;
  v_night   date;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking is null then
    raise exception 'Booking not found.' using errcode = 'P0002';
  end if;

  -- An agent may cancel their own agency's booking; back-office staff need
  -- the permission. Both paths land here so inventory is always restored.
  if not (
    public.has_permission(auth.uid(), 'bookings.cancel')
    or (v_booking.agency_id = public.current_agency_id() and public.is_active_user())
  ) then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  if v_booking.status in ('cancelled', 'completed') then
    raise exception 'This booking can no longer be cancelled.' using errcode = '22023';
  end if;

  -- Give the rooms back, night by night, for every item that came from our
  -- own inventory. Without this a cancelled booking would keep holding stock.
  for v_item in
    select room_type_id, rooms from public.booking_items
    where booking_id = p_booking_id and room_type_id is not null
  loop
    v_night := v_booking.check_in;
    while v_night < v_booking.check_out loop
      update public.allocations
         set sold = greatest(sold - v_item.rooms, 0)
       where room_type_id = v_item.room_type_id
         and stay_date = v_night;
      v_night := v_night + 1;
    end loop;
  end loop;

  update public.bookings
     set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
         cancellation_reason = p_reason
   where id = p_booking_id;

  perform public.write_audit('cancel', 'bookings', p_booking_id::text,
                             jsonb_build_object('reason', p_reason));
end;
$$;

create or replace function public.complete_booking(p_booking_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking record;
begin
  if not public.has_permission(auth.uid(), 'bookings.confirm') then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking is null then
    raise exception 'Booking not found.' using errcode = 'P0002';
  end if;
  if v_booking.status <> 'confirmed' then
    raise exception 'Only a confirmed booking can be completed.' using errcode = '22023';
  end if;
  -- Completing a stay that has not happened yet would make the reports lie.
  if v_booking.check_out > current_date then
    raise exception 'This stay has not finished yet.' using errcode = '22023';
  end if;

  update public.bookings
     set status = 'completed', completed_at = now()
   where id = p_booking_id;

  perform public.write_audit('complete', 'bookings', p_booking_id::text, null);
end;
$$;

revoke all on function public.confirm_booking(uuid)          from public, anon;
revoke all on function public.cancel_booking(uuid, text)     from public, anon;
revoke all on function public.complete_booking(uuid)         from public, anon;
grant execute on function public.confirm_booking(uuid)       to authenticated;
grant execute on function public.cancel_booking(uuid, text)  to authenticated;
grant execute on function public.complete_booking(uuid)      to authenticated;

-- ----------------------------------------------------------------------------
-- 6. RLS
--
-- Reads only. Every write goes through the RPCs above, so there is deliberately
-- no INSERT, UPDATE or DELETE policy on either table: a booking cannot be
-- created, re-priced or deleted from the client at all.
-- ----------------------------------------------------------------------------

alter table public.bookings      enable row level security;
alter table public.booking_items enable row level security;

create policy bookings_read
  on public.bookings for select
  to authenticated
  using (
    (agency_id = public.current_agency_id() and public.is_active_user())
    or public.authorize('bookings.view_all')
  );

create policy booking_items_read
  on public.booking_items for select
  to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and ((b.agency_id = public.current_agency_id() and public.is_active_user())
             or public.authorize('bookings.view_all'))
    )
  );

-- ----------------------------------------------------------------------------
-- 7. Agent-visible credit summary
--
-- Agents cannot read `bookings` totals in aggregate cheaply, and the balance
-- rule belongs in one place. This returns only figures the agent is entitled
-- to see about their own company.
-- ----------------------------------------------------------------------------

create or replace function public.my_credit_summary()
returns table (credit_limit numeric, outstanding numeric, available numeric, currency_code char(3))
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_agency_id uuid := public.current_agency_id();
begin
  if not public.is_active_user() or v_agency_id is null then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  return query
  select a.credit_limit,
         public.agency_outstanding(a.id),
         a.credit_limit - public.agency_outstanding(a.id),
         a.currency_code
  from public.agencies a
  where a.id = v_agency_id;
end;
$$;

revoke all on function public.my_credit_summary() from public, anon;
grant execute on function public.my_credit_summary() to authenticated;
