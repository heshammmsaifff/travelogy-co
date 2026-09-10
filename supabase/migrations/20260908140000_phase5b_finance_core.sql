-- ============================================================================
-- Phase 5b — finance: currencies, tax, promo codes and the payments ledger
--
-- The organising idea is §10: an agent's balance is DERIVED, never stored.
-- Bookings that still stand are the debits; rows in `payments` are the credits.
-- There is deliberately no `balance` column anywhere — a number nothing
-- maintains is exactly the fake completeness §2.3 prohibits, and a balance that
-- can be typed in is not reconcilable.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Permissions
-- ----------------------------------------------------------------------------

insert into public.permissions (key, module, name_ar, name_en, description_ar, description_en)
values
  ('finance.payments.record', 'finance', 'تسجيل الدفعات', 'Record payments',
   'تسجيل دفعة مستلمة من وكيل على كشف حسابه.', 'Record a payment received from an agent against their account.'),
  ('finance.statements.view', 'finance', 'عرض كشوف الحسابات', 'View statements',
   'الاطلاع على كشف حساب أي وكيل والمستحقات.', 'See any agency statement of account and the receivables position.'),
  ('finance.settings.manage', 'finance', 'إعدادات المالية', 'Manage finance settings',
   'الضرائب والعملات وأسعار الصرف وأكواد الخصم.', 'Tax rates, currencies, exchange rates and promo codes.')
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- 1. Currencies and exchange rates
--
-- Built now even though one currency is exposed (§13). Adding a second later
-- must be data, not a redesign — which is why bookings already carry their own
-- `currency_code` rather than assuming the agency's.
-- ----------------------------------------------------------------------------

create table public.currencies (
  code          char(3) primary key,
  name_ar       text not null,
  name_en       text not null,
  symbol        text not null,
  -- JPY has 0, KWD has 3. Rounding money by a hardcoded 2 is a bug waiting for
  -- the first non-EGP contract.
  decimals      smallint not null default 2 check (decimals between 0 and 3),
  is_base       boolean not null default false,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

comment on table public.currencies is
  'Exactly one row may be is_base — every exchange rate is expressed against it.';

-- Enforced as a constraint rather than a convention: two base currencies would
-- make every conversion ambiguous and nothing would notice.
create unique index currencies_single_base on public.currencies (is_base) where is_base;

create table public.exchange_rates (
  id             uuid primary key default gen_random_uuid(),
  currency_code  char(3) not null references public.currencies (code) on delete cascade,
  -- How many units of the BASE currency one unit of this currency buys.
  rate_to_base   numeric(18, 8) not null check (rate_to_base > 0),
  effective_from date not null,
  created_at     timestamptz not null default now(),
  created_by     uuid references public.profiles (id) on delete set null,

  -- One rate per currency per day: a second would make "the rate on that date"
  -- depend on which row a query happened to return.
  unique (currency_code, effective_from)
);

create index exchange_rates_lookup_idx
  on public.exchange_rates (currency_code, effective_from desc);

insert into public.currencies (code, name_ar, name_en, symbol, decimals, is_base) values
  ('EGP', 'جنيه مصري', 'Egyptian Pound', 'ج.م', 2, true),
  ('USD', 'دولار أمريكي', 'US Dollar', '$', 2, false),
  ('EUR', 'يورو', 'Euro', '€', 2, false),
  ('SAR', 'ريال سعودي', 'Saudi Riyal', 'ر.س', 2, false)
on conflict (code) do nothing;

-- No seeded exchange rates. Inventing a rate would be inventing money — the
-- admin enters real ones before a second currency is switched on.

-- ----------------------------------------------------------------------------
-- 2. Tax
-- ----------------------------------------------------------------------------

create table public.tax_rates (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique check (code ~ '^[A-Z][A-Z0-9_]{1,20}$'),
  name_ar       text not null,
  name_en       text not null,
  percent       numeric(6, 3) not null check (percent >= 0 and percent <= 100),
  -- The one applied to a new booking when nothing more specific says otherwise.
  is_default    boolean not null default false,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.profiles (id) on delete set null
);

create unique index tax_rates_single_default on public.tax_rates (is_default) where is_default;

create trigger tax_rates_set_updated_at
  before update on public.tax_rates
  for each row execute function public.set_updated_at();

-- Seeded INACTIVE and at zero on purpose: the client has not told us their VAT
-- position, and a tax rate invented here would silently change every price.
insert into public.tax_rates (code, name_ar, name_en, percent, is_default, is_active)
values ('NONE', 'بدون ضريبة', 'No tax', 0, true, true)
on conflict (code) do nothing;

-- ----------------------------------------------------------------------------
-- 3. Promo codes
-- ----------------------------------------------------------------------------

create table public.promo_codes (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique check (code ~ '^[A-Z0-9][A-Z0-9_-]{2,29}$'),
  name_ar        text not null,
  name_en        text not null,

  discount_type  public.charge_type not null default 'percentage',
  discount_value numeric(14, 2) not null check (discount_value >= 0),

  -- Optional scoping. NULL means "any agency".
  agency_id      uuid references public.agencies (id) on delete cascade,

  min_booking_total numeric(14, 2) check (min_booking_total is null or min_booking_total >= 0),
  -- A percentage discount without a ceiling on a large booking is how a promo
  -- becomes an unbudgeted liability.
  max_discount   numeric(14, 2) check (max_discount is null or max_discount >= 0),

  valid_from     date not null,
  valid_to       date not null,

  -- NULL means unlimited. `times_used` is maintained by the redemption trigger,
  -- never written by hand.
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  max_per_agency  integer check (max_per_agency is null or max_per_agency > 0),
  times_used      integer not null default 0 check (times_used >= 0),

  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references public.profiles (id) on delete set null,

  constraint promo_codes_dates_ordered check (valid_to >= valid_from),
  constraint promo_codes_percentage_sane
    check (discount_type <> 'percentage' or discount_value <= 100)
);

comment on column public.promo_codes.times_used is
  'Maintained by the redemption trigger. Writing it by hand would let a code outlive its limit.';

create index promo_codes_lookup_idx on public.promo_codes (code) where is_active;

create trigger promo_codes_set_updated_at
  before update on public.promo_codes
  for each row execute function public.set_updated_at();

create table public.promo_code_redemptions (
  id            uuid primary key default gen_random_uuid(),
  promo_code_id uuid not null references public.promo_codes (id) on delete cascade,
  booking_id    uuid not null references public.bookings (id) on delete cascade,
  agency_id     uuid not null references public.agencies (id) on delete cascade,
  discount_amount numeric(14, 2) not null check (discount_amount >= 0),
  redeemed_at   timestamptz not null default now(),

  -- One redemption per booking. Without this a retry could double-count.
  unique (booking_id)
);

create index promo_redemptions_code_idx on public.promo_code_redemptions (promo_code_id);
create index promo_redemptions_agency_idx on public.promo_code_redemptions (agency_id, promo_code_id);

-- `times_used` is a cache of this table, kept correct by the database rather
-- than by whoever remembers to increment it.
create or replace function public.sync_promo_usage()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    update public.promo_codes set times_used = times_used + 1 where id = new.promo_code_id;
    return new;
  end if;
  update public.promo_codes
     set times_used = greatest(times_used - 1, 0)
   where id = old.promo_code_id;
  return old;
end;
$$;

revoke all on function public.sync_promo_usage() from public, anon, authenticated;

create trigger promo_redemptions_sync
  after insert or delete on public.promo_code_redemptions
  for each row execute function public.sync_promo_usage();

-- ----------------------------------------------------------------------------
-- 4. The payments ledger (§10)
-- ----------------------------------------------------------------------------

create type public.payment_kind   as enum ('receipt', 'refund');
create type public.payment_method as enum ('bank_transfer', 'cheque', 'cash', 'adjustment');

create table public.payments (
  id            uuid primary key default gen_random_uuid(),
  reference     text not null unique,

  agency_id     uuid not null references public.agencies (id) on delete restrict,
  kind          public.payment_kind not null default 'receipt',
  method        public.payment_method not null,

  amount        numeric(14, 2) not null check (amount > 0),
  currency_code char(3) not null references public.currencies (code),

  -- The bank's reference, cheque number, or whatever ties this row to reality.
  external_reference text,
  -- When the money actually moved, which is not when it was typed in.
  paid_on       date not null,
  notes         text check (notes is null or length(notes) <= 1000),

  recorded_by   uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);

comment on table public.payments is
  'The credit side of every agency account. Amounts are always positive; `kind` says which way the money went. A refund is a separate row, never a negative receipt — a ledger you can read backwards is a ledger you can audit.';

create index payments_agency_idx on public.payments (agency_id, paid_on desc);

create sequence public.payment_ref_seq start 1;

-- ----------------------------------------------------------------------------
-- 5. RLS
-- ----------------------------------------------------------------------------

alter table public.currencies             enable row level security;
alter table public.exchange_rates         enable row level security;
alter table public.tax_rates              enable row level security;
alter table public.promo_codes            enable row level security;
alter table public.promo_code_redemptions enable row level security;
alter table public.payments               enable row level security;

-- Reference data every signed-in user needs to render money correctly.
create policy currencies_read on public.currencies for select to authenticated using (true);
create policy exchange_rates_read on public.exchange_rates for select to authenticated using (true);
create policy tax_rates_read on public.tax_rates for select to authenticated using (true);

create policy currencies_write on public.currencies for all to authenticated
  using (public.authorize('finance.settings.manage'))
  with check (public.authorize('finance.settings.manage'));

create policy exchange_rates_write on public.exchange_rates for all to authenticated
  using (public.authorize('finance.settings.manage'))
  with check (public.authorize('finance.settings.manage'));

create policy tax_rates_write on public.tax_rates for all to authenticated
  using (public.authorize('finance.settings.manage'))
  with check (public.authorize('finance.settings.manage'));

-- An agent may read a code they are entitled to use, so the booking form can
-- show what it is worth. They cannot read another agency's private code.
create policy promo_codes_read
  on public.promo_codes for select
  to authenticated
  using (
    (is_active and (agency_id is null or agency_id = public.current_agency_id()) and public.is_active_user())
    or public.authorize('finance.settings.manage')
  );

create policy promo_codes_write on public.promo_codes for all to authenticated
  using (public.authorize('finance.settings.manage'))
  with check (public.authorize('finance.settings.manage'));

create policy promo_redemptions_read
  on public.promo_code_redemptions for select
  to authenticated
  using (
    (agency_id = public.current_agency_id() and public.is_active_user())
    or public.authorize('finance.statements.view')
  );

-- No write policy: redemptions are written by create_booking only.

-- An agent SEES their own payments — that is their statement — but can never
-- write one. Recording money received is the operator's act (§10).
create policy payments_read
  on public.payments for select
  to authenticated
  using (
    (agency_id = public.current_agency_id() and public.is_active_user())
    or public.authorize('finance.statements.view')
  );

-- No INSERT/UPDATE/DELETE policy at all: `record_payment` is the only way in,
-- so a payment cannot be created without its audit row and its reference.

-- ----------------------------------------------------------------------------
-- 6. Recording a payment
-- ----------------------------------------------------------------------------

create or replace function public.record_payment(
  p_agency_id  uuid,
  p_method     public.payment_method,
  p_amount     numeric,
  p_paid_on    date,
  p_kind       public.payment_kind default 'receipt',
  p_currency   char(3) default null,
  p_external_reference text default null,
  p_notes      text default null
)
returns table (payment_id uuid, reference text)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_reference text;
  v_currency  char(3);
  v_id        uuid;
begin
  -- Standing rule (§15, 5.x): a system context is `auth.uid() is null`.
  if auth.uid() is not null and not public.has_permission(auth.uid(), 'finance.payments.record') then
    raise exception 'Not permitted.' using errcode = '42501';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'A payment amount must be greater than zero.' using errcode = '22023';
  end if;

  -- Default to the agency's own currency rather than a hardcoded one.
  select coalesce(p_currency, a.currency_code) into v_currency
  from public.agencies a where a.id = p_agency_id;

  if v_currency is null then
    raise exception 'Agency not found.' using errcode = 'P0002';
  end if;

  v_reference := 'LLT-P-' || lpad(nextval('public.payment_ref_seq')::text, 6, '0');

  insert into public.payments (
    reference, agency_id, kind, method, amount, currency_code,
    external_reference, paid_on, notes, recorded_by
  ) values (
    v_reference, p_agency_id, p_kind, p_method, p_amount, v_currency,
    p_external_reference, p_paid_on, p_notes, auth.uid()
  )
  returning id into v_id;

  perform public.write_audit(
    'record_payment', 'payments', v_id::text,
    jsonb_build_object('agency_id', p_agency_id, 'amount', p_amount,
                       'kind', p_kind, 'method', p_method, 'reference', v_reference)
  );

  return query select v_id, v_reference;
end;
$$;

revoke all on function public.record_payment(uuid, public.payment_method, numeric, date, public.payment_kind, char, text, text) from public, anon;
grant execute on function public.record_payment(uuid, public.payment_method, numeric, date, public.payment_kind, char, text, text) to authenticated;

-- Deleting a payment would break the reconciliation the ledger exists for.
-- Reversing one means recording the opposite kind, which leaves both rows.
create or replace function public.prevent_payment_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception 'A payment cannot be % once recorded. Record the opposite entry instead.',
    lower(tg_op) using errcode = '42501';
end;
$$;

revoke all on function public.prevent_payment_mutation() from public, anon, authenticated;

create trigger payments_immutable
  before update or delete on public.payments
  for each row execute function public.prevent_payment_mutation();
