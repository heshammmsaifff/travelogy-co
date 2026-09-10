-- ============================================================================
-- Phase 8d — CRM: prospects, activities and follow-up
--
-- Scope chosen by the client: this is the CLIENT'S OWN sales tool. Its subject
-- is travel agencies — the ones being courted before they register, and the
-- ones already trading. It is not an address book the agencies use for their
-- travellers; that was the alternative and it was not chosen.
--
-- The consequence that matters most: an agency must never be able to read what
-- the sales team has written ABOUT them. There is no agent-facing policy on
-- any table here, deliberately, and the suite proves it rather than assuming.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Permissions
-- ----------------------------------------------------------------------------

insert into public.permissions (key, module, name_ar, name_en, description_ar, description_en)
values
  ('crm.view', 'crm', 'عرض العملاء المحتملين', 'View CRM',
   'الاطلاع على العملاء المحتملين وسجل التواصل والمهام.',
   'See leads, the contact history and follow-up tasks.'),
  ('crm.manage', 'crm', 'إدارة العملاء المحتملين', 'Manage CRM',
   'إضافة وتعديل العملاء المحتملين وتسجيل التواصل وإسناد المهام.',
   'Add and edit leads, log contact and assign follow-up tasks.')
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- 2. Leads
-- ----------------------------------------------------------------------------

create type public.lead_stage as enum (
  'new',        -- captured, nobody has spoken to them yet
  'contacted',  -- first conversation happened
  'qualified',  -- they are a real prospect with a real need
  'proposal',   -- terms and rates are with them
  'won',        -- they became a registered agency
  'lost'        -- they are not going to
);

create type public.lead_source as enum (
  'referral', 'website', 'exhibition', 'cold_call', 'social', 'existing_client', 'other'
);

create sequence public.lead_ref_seq start 1;

create table public.crm_leads (
  id             uuid primary key default gen_random_uuid(),

  -- Human-facing, so a lead can be named in an email or on a call.
  reference      text not null unique
                 default 'LLT-L-' || lpad(nextval('public.lead_ref_seq')::text, 6, '0'),

  company_name   text not null check (length(btrim(company_name)) between 2 and 200),
  contact_name   text check (contact_name is null or length(btrim(contact_name)) <= 200),
  email          text check (email is null or position('@' in email) > 1),
  phone          text,

  country_code   char(2),
  city           text,

  source         public.lead_source not null default 'other',
  stage          public.lead_stage not null default 'new',

  -- The staff member whose name is on this prospect. `set null` rather than
  -- cascade: losing the owner must not lose the prospect (§15, 2.8's reasoning
  -- applied to a lead).
  owner_id       uuid references public.profiles (id) on delete set null,

  /**
   * The agency this lead BECAME.
   *
   * The CRM never creates an agency. Agencies exist only through
   * self-registration plus admin approval (§15, 2.3 and 3.3), and a second
   * path into existence would be a way around the approval gate. Winning a
   * lead therefore LINKS it to an agency that already registered — it does not
   * mint one.
   */
  agency_id      uuid references public.agencies (id) on delete set null,

  -- Why it did not happen. A pipeline that cannot say why it lost is a list.
  lost_reason    text check (lost_reason is null or length(lost_reason) <= 500),

  notes          text check (notes is null or length(notes) <= 4000),

  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- The two stages that mean something must carry their evidence.
  constraint crm_leads_won_has_agency
    check (stage <> 'won' or agency_id is not null),
  constraint crm_leads_lost_has_reason
    check (stage <> 'lost' or (lost_reason is not null and btrim(lost_reason) <> '')),

  -- One lead per agency: two open prospects for the same company is a
  -- duplicate somebody will work twice.
  constraint crm_leads_one_per_agency unique (agency_id)
);

comment on table public.crm_leads is
  'A prospective agency the sales team is working. Winning one links it to an agency that registered through the normal route; the CRM never creates an agency itself.';

create index crm_leads_stage_idx on public.crm_leads (stage, updated_at desc);
create index crm_leads_owner_idx on public.crm_leads (owner_id) where owner_id is not null;

create trigger crm_leads_set_updated_at
  before update on public.crm_leads
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3. Activities — what was said, and when
--
-- ONE table covering both a lead and an existing agency, with a CHECK that
-- exactly one is set. Two tables would mean two queries and two shapes for
-- what is the same thing: a record of contact. The timeline on either screen
-- is then one query.
-- ----------------------------------------------------------------------------

create type public.activity_kind as enum ('call', 'email', 'meeting', 'whatsapp', 'note');

create table public.crm_activities (
  id           uuid primary key default gen_random_uuid(),

  lead_id      uuid references public.crm_leads (id) on delete cascade,
  agency_id    uuid references public.agencies (id) on delete cascade,

  kind         public.activity_kind not null default 'note',
  subject      text not null check (length(btrim(subject)) between 2 and 200),
  body         text check (body is null or length(body) <= 4000),

  -- When it HAPPENED, not when it was typed. A call logged the next morning
  -- belongs on the day of the call or the timeline lies about the sequence.
  occurred_at  timestamptz not null default now(),

  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint crm_activities_one_subject
    check (num_nonnulls(lead_id, agency_id) = 1)
);

create index crm_activities_lead_idx on public.crm_activities (lead_id, occurred_at desc)
  where lead_id is not null;
create index crm_activities_agency_idx on public.crm_activities (agency_id, occurred_at desc)
  where agency_id is not null;

create trigger crm_activities_set_updated_at
  before update on public.crm_activities
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 4. Tasks — what happens next
-- ----------------------------------------------------------------------------

create type public.task_status as enum ('open', 'done', 'cancelled');

create table public.crm_tasks (
  id            uuid primary key default gen_random_uuid(),

  lead_id       uuid references public.crm_leads (id) on delete cascade,
  agency_id     uuid references public.agencies (id) on delete cascade,

  title         text not null check (length(btrim(title)) between 2 and 200),
  notes         text check (notes is null or length(notes) <= 2000),

  due_on        date not null,
  status        public.task_status not null default 'open',

  assigned_to   uuid references public.profiles (id) on delete set null,

  completed_at  timestamptz,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint crm_tasks_one_subject
    check (num_nonnulls(lead_id, agency_id) = 1),
  -- A finished task must know when it finished, and an open one must not
  -- claim to. Otherwise "done" is a label with no timestamp behind it.
  constraint crm_tasks_completion_stamped
    check ((status = 'done') = (completed_at is not null))
);

create index crm_tasks_due_idx on public.crm_tasks (due_on) where status = 'open';
create index crm_tasks_assignee_idx on public.crm_tasks (assigned_to, due_on)
  where status = 'open';

create trigger crm_tasks_set_updated_at
  before update on public.crm_tasks
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 5. RLS
--
-- Back-office only, and that is the point rather than an omission. These
-- tables hold the sales team's private view of a company — "they are shopping
-- around", "their credit request is a stretch" — and the company itself is a
-- signed-in user of this platform holding a real token against PostgREST.
--
-- So: NO policy mentions `current_agency_id()` anywhere in this file. An
-- agency reading its own row is exactly the thing that must not happen, which
-- is the opposite of every other table in the schema.
--
-- Policies call only authorize() — one of the four the caller may execute
-- (§15, Phase 4).
-- ----------------------------------------------------------------------------

alter table public.crm_leads      enable row level security;
alter table public.crm_activities enable row level security;
alter table public.crm_tasks      enable row level security;

create policy crm_leads_read
  on public.crm_leads for select
  to authenticated
  using (public.authorize('crm.view') or public.authorize('crm.manage'));

create policy crm_leads_write
  on public.crm_leads for all
  to authenticated
  using (public.authorize('crm.manage'))
  with check (public.authorize('crm.manage'));

create policy crm_activities_read
  on public.crm_activities for select
  to authenticated
  using (public.authorize('crm.view') or public.authorize('crm.manage'));

create policy crm_activities_write
  on public.crm_activities for all
  to authenticated
  using (public.authorize('crm.manage'))
  with check (public.authorize('crm.manage'));

create policy crm_tasks_read
  on public.crm_tasks for select
  to authenticated
  using (public.authorize('crm.view') or public.authorize('crm.manage'));

create policy crm_tasks_write
  on public.crm_tasks for all
  to authenticated
  using (public.authorize('crm.manage'))
  with check (public.authorize('crm.manage'));
