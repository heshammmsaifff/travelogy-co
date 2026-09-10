-- ============================================================================
-- Phase 5c — the issuing company's own details
--
-- An invoice needs a "from" as much as a "to". Until now the platform had no
-- record of its own legal name, address or tax number, so an invoice could
-- only have been issued by "Last Line Travel" and nothing else — which is not
-- an invoice, it is a receipt-shaped web page.
--
-- A singleton: one row, enforced. A settings table that can hold two rows will
-- eventually hold two, and then every document has to pick one.
-- ============================================================================

create table public.company_profile (
  id            boolean primary key default true,

  legal_name_ar text not null default 'لاست لاين ترافل',
  legal_name_en text not null default 'Last Line Travel',
  address_ar    text,
  address_en    text,
  phone         text,
  email         text,
  website       text,

  -- Printed on every invoice where a jurisdiction requires it.
  tax_number    text,
  commercial_reg_no text,

  -- Cloudinary public_id, uploaded through the signed route (§8).
  logo_public_id text,

  -- Free text under the totals: payment instructions, bank details, terms.
  invoice_footer_ar text,
  invoice_footer_en text,

  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.profiles (id) on delete set null,

  -- The singleton, as a constraint rather than a convention.
  constraint company_profile_singleton check (id)
);

comment on table public.company_profile is
  'Exactly one row. The issuing company on vouchers and invoices.';

create trigger company_profile_set_updated_at
  before update on public.company_profile
  for each row execute function public.set_updated_at();

insert into public.company_profile (id) values (true) on conflict (id) do nothing;

alter table public.company_profile enable row level security;

-- Readable by any signed-in user: it is printed on their own documents.
create policy company_profile_read
  on public.company_profile for select
  to authenticated
  using (public.is_active_user());

create policy company_profile_update
  on public.company_profile for update
  to authenticated
  using (public.authorize('finance.settings.manage'))
  with check (public.authorize('finance.settings.manage'));

-- No INSERT or DELETE policy: there is one row and it already exists.
