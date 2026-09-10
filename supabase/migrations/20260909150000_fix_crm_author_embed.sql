-- ============================================================================
-- Fix: the contact timeline was always empty, whatever was in the table.
--
-- `crm_*.created_by` referenced `auth.users`, so PostgREST could not resolve
-- `author:profiles!crm_activities_created_by_fkey` — the whole select errored
-- and the repository's `data ?? []` rendered the error as "no contact logged
-- yet". A row that exists, denied by the screen.
--
-- `profiles.id` IS `auth.users.id`, so pointing the column at `profiles`
-- names the same person and makes the embed resolvable. It also matches how
-- `crm_leads.owner_id` and `crm_tasks.assigned_to` were already written —
-- those two worked, which is what made the difference visible.
-- ============================================================================

alter table public.crm_leads      drop constraint crm_leads_created_by_fkey;
alter table public.crm_activities drop constraint crm_activities_created_by_fkey;
alter table public.crm_tasks      drop constraint crm_tasks_created_by_fkey;

alter table public.crm_leads
  add constraint crm_leads_created_by_fkey
    foreign key (created_by) references public.profiles (id) on delete set null;

alter table public.crm_activities
  add constraint crm_activities_created_by_fkey
    foreign key (created_by) references public.profiles (id) on delete set null;

alter table public.crm_tasks
  add constraint crm_tasks_created_by_fkey
    foreign key (created_by) references public.profiles (id) on delete set null;
