-- ============================================================================
-- Phase 4 — saved quotations
--
-- An agent searches, finds offers worth proposing to their customer, and saves
-- them together as a quotation they can come back to.
--
-- THE CENTRAL DESIGN DECISION: a quotation item stores a full SNAPSHOT of the
-- offer — names, meal plan, nights, price — rather than a foreign key to the
-- live rate. Three reasons, in order of importance:
--
--   1. A quote is a promise made to a customer at a moment in time. If it
--      re-read live prices, reopening it tomorrow would silently show a
--      different number than the one the agent quoted.
--   2. External supplier offers have no row in our database to point at, and
--      the whole point of the port (§9) is that the agent cannot tell which
--      supplier answered. Half the quotations being snapshots and half being
--      references would leak that distinction.
--   3. Rates are net + margin resolved at search time (§15, 7.3). Storing a
--      reference and re-resolving later would mean recomputing a margin that
--      may have changed since.
--
-- The cost is that a saved price can go stale. That is stated on screen with
-- the capture time, rather than hidden (§2.3).
-- ============================================================================

create type public.quotation_status as enum ('draft', 'sent', 'accepted', 'expired');

-- Human-facing reference, minted server-side for the same reason hotel codes
-- are (§15, Phase 3a): two agents saving at once would otherwise collide.
create sequence public.quotation_ref_seq start 1;

create or replace function public.next_quotation_ref()
returns text
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  select 'LLT-Q-' || lpad(nextval('public.quotation_ref_seq')::text, 6, '0');
$$;

revoke all on function public.next_quotation_ref() from public, anon;
grant execute on function public.next_quotation_ref() to authenticated;

-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------

create table public.quotations (
  id            uuid primary key default gen_random_uuid(),
  reference     text not null unique,

  agency_id     uuid not null references public.agencies (id) on delete cascade,
  created_by    uuid references public.profiles (id) on delete set null,

  -- What the agent calls this quote internally, and who it is for.
  title         text check (title is null or length(btrim(title)) between 2 and 200),
  guest_name    text check (guest_name is null or length(btrim(guest_name)) between 2 and 200),

  check_in      date not null,
  check_out     date not null,
  adults        smallint not null default 2 check (adults between 1 and 20),
  children      smallint not null default 0 check (children between 0 and 10),
  rooms         smallint not null default 1 check (rooms between 1 and 10),

  currency_code char(3) not null default 'EGP',
  status        public.quotation_status not null default 'draft',

  -- When the agent told the customer the price would hold until.
  valid_until   date,
  notes         text check (notes is null or length(notes) <= 2000),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint quotations_dates_ordered check (check_out > check_in)
);

comment on table public.quotations is
  'An agent-built proposal for their own customer. Prices are snapshots taken at save time — see quotation_items.';

create index quotations_agency_idx on public.quotations (agency_id, created_at desc);
create index quotations_status_idx on public.quotations (agency_id, status);

create trigger quotations_set_updated_at
  before update on public.quotations
  for each row execute function public.set_updated_at();

create table public.quotation_items (
  id              uuid primary key default gen_random_uuid(),
  quotation_id    uuid not null references public.quotations (id) on delete cascade,

  -- Which provider answered, and its own identifiers. Kept so a Phase 5
  -- booking attempt knows where to send the request; NOT a foreign key,
  -- because an external supplier has no row here (see the header).
  supplier_key    text not null,
  hotel_ref       text not null,
  room_ref        text not null,
  rate_plan_ref   text not null,
  offer_ref       text not null,

  -- ---- snapshot of what the agent saw -------------------------------------
  hotel_name_ar   text not null,
  hotel_name_en   text not null,
  city_ar         text,
  city_en         text,
  country_code    char(2),
  star_rating     smallint check (star_rating is null or star_rating between 1 and 7),
  cover_url       text,

  room_name_ar    text not null,
  room_name_en    text not null,
  plan_name_ar    text not null,
  plan_name_en    text not null,
  meal_plan_key   text not null,

  nights          smallint not null check (nights between 1 and 30),
  rooms           smallint not null default 1 check (rooms between 1 and 10),
  currency_code   char(3) not null,
  sell_per_night  numeric(14, 2) not null check (sell_per_night >= 0),
  sell_total      numeric(14, 2) not null check (sell_total >= 0),
  is_refundable   boolean not null default false,

  -- What makes the staleness visible instead of implied.
  captured_at     timestamptz not null default now(),

  sort_order      integer not null default 0
);

comment on table public.quotation_items is
  'A price snapshot, not a live reference. sell_* are SELL prices with markup already applied — a net rate must never be written here (CLAUDE.md §15, decision 6.1).';

comment on column public.quotation_items.captured_at is
  'When this price was read from the provider. Shown to the agent so a stale quote is visibly stale.';

create index quotation_items_quotation_idx on public.quotation_items (quotation_id, sort_order);

-- ----------------------------------------------------------------------------
-- 2. RLS
--
-- Quotations are agency-scoped: every user of a company shares them, because a
-- quote belongs to the company and not to whoever happened to build it. A
-- colleague must be able to pick it up.
-- ----------------------------------------------------------------------------

alter table public.quotations      enable row level security;
alter table public.quotation_items enable row level security;

create policy quotations_read
  on public.quotations for select
  to authenticated
  using (
    (agency_id = public.current_agency_id() and public.is_active_user())
    or public.is_super_admin()
  );

create policy quotations_insert
  on public.quotations for insert
  to authenticated
  with check (agency_id = public.current_agency_id() and public.is_active_user());

create policy quotations_update
  on public.quotations for update
  to authenticated
  using (agency_id = public.current_agency_id() and public.is_active_user())
  with check (agency_id = public.current_agency_id() and public.is_active_user());

create policy quotations_delete
  on public.quotations for delete
  to authenticated
  using (agency_id = public.current_agency_id() and public.is_active_user());

-- Items inherit their parent's visibility. Written as an EXISTS against
-- `quotations` rather than duplicating the agency test, so the two can never
-- drift apart.
create policy quotation_items_read
  on public.quotation_items for select
  to authenticated
  using (
    exists (
      select 1 from public.quotations q
      where q.id = quotation_id
        and ((q.agency_id = public.current_agency_id() and public.is_active_user())
             or public.is_super_admin())
    )
  );

create policy quotation_items_insert
  on public.quotation_items for insert
  to authenticated
  with check (
    exists (
      select 1 from public.quotations q
      where q.id = quotation_id
        and q.agency_id = public.current_agency_id()
        and public.is_active_user()
    )
  );

create policy quotation_items_update
  on public.quotation_items for update
  to authenticated
  using (
    exists (
      select 1 from public.quotations q
      where q.id = quotation_id
        and q.agency_id = public.current_agency_id()
        and public.is_active_user()
    )
  )
  with check (
    exists (
      select 1 from public.quotations q
      where q.id = quotation_id
        and q.agency_id = public.current_agency_id()
        and public.is_active_user()
    )
  );

create policy quotation_items_delete
  on public.quotation_items for delete
  to authenticated
  using (
    exists (
      select 1 from public.quotations q
      where q.id = quotation_id
        and q.agency_id = public.current_agency_id()
        and public.is_active_user()
    )
  );

-- ----------------------------------------------------------------------------
-- 3. Guard: the agency and the reference are not the agent's to change
--
-- RLS grants rows, not columns — the same gap that let an owner raise their own
-- credit limit in Phase 1 (§15). Without this an agent could move a quotation
-- to another agency, or rewrite a reference already sent to a customer.
-- ----------------------------------------------------------------------------

create or replace function public.prevent_quotation_identity_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Standing rule from §15 (5.x): a system context is `auth.uid() is null`,
  -- not only an explicit service_role claim.
  if auth.uid() is null or public.is_super_admin() then
    return new;
  end if;

  if new.agency_id is distinct from old.agency_id then
    raise exception 'A quotation cannot be moved to another agency.' using errcode = '42501';
  end if;

  if new.reference is distinct from old.reference then
    raise exception 'The quotation reference cannot be changed.' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_quotation_identity_change() from public, anon, authenticated;

create trigger quotations_protect_identity
  before update on public.quotations
  for each row execute function public.prevent_quotation_identity_change();
