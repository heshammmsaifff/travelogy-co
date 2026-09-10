import "server-only";

import { createClient } from "@/shared/lib/supabase/server";
import {
  LEAD_STAGES,
  type ActivityKind,
  type LeadSource,
  type LeadStage,
  type TaskStatus,
} from "@/modules/crm/domain/crm";

/**
 * CRM reads (CLAUDE.md §13, Phase 8d).
 *
 * Back-office only, and that is a property of the tables rather than of this
 * file: no policy in `20260909140000` mentions `current_agency_id()`, so an
 * agency reading what the sales team wrote about them is impossible at the
 * database rather than merely unimplemented here.
 */

export type {
  ActivityKind,
  LeadSource,
  LeadStage,
  TaskStatus,
} from "@/modules/crm/domain/crm";

export type Lead = {
  id: string;
  reference: string;
  companyName: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  countryCode: string | null;
  city: string | null;
  source: LeadSource;
  stage: LeadStage;
  ownerId: string | null;
  ownerName: string | null;
  agencyId: string | null;
  /** Snapshot taken at conversion; survives the agency being deleted. */
  wonAgencyName: string | null;
  wonAgencyCode: string | null;
  lostReason: string | null;
  notes: string | null;
  updatedAt: string;
};

export type Activity = {
  id: string;
  kind: ActivityKind;
  subject: string;
  body: string | null;
  occurredAt: string;
  authorName: string | null;
};

export type Task = {
  id: string;
  title: string;
  notes: string | null;
  dueOn: string;
  status: TaskStatus;
  assignedTo: string | null;
  assigneeName: string | null;
  leadId: string | null;
  agencyId: string | null;
  /** For the cross-cutting list, so a row can say what it is about. */
  subjectLabel: string | null;
};

const LEAD_COLUMNS =
  "id, reference, company_name, contact_name, email, phone, country_code, city, source, stage, owner_id, agency_id, won_agency_name, won_agency_code, lost_reason, notes, updated_at, owner:profiles!crm_leads_owner_id_fkey (full_name)";

type LeadRow = {
  id: string;
  reference: string;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  country_code: string | null;
  city: string | null;
  source: string;
  stage: string;
  owner_id: string | null;
  agency_id: string | null;
  won_agency_name: string | null;
  won_agency_code: string | null;
  lost_reason: string | null;
  notes: string | null;
  updated_at: string;
  owner: { full_name: string } | null;
};

function toLead(r: LeadRow): Lead {
  return {
    id: r.id,
    reference: r.reference,
    companyName: r.company_name,
    contactName: r.contact_name,
    email: r.email,
    phone: r.phone,
    countryCode: r.country_code,
    city: r.city,
    source: r.source as LeadSource,
    stage: r.stage as LeadStage,
    ownerId: r.owner_id,
    ownerName: r.owner?.full_name ?? null,
    agencyId: r.agency_id,
    wonAgencyName: r.won_agency_name,
    wonAgencyCode: r.won_agency_code,
    lostReason: r.lost_reason,
    notes: r.notes,
    updatedAt: r.updated_at,
  };
}

export async function listLeads(filters: { stage?: string; q?: string } = {}): Promise<Lead[]> {
  const supabase = await createClient();
  let query = supabase
    .from("crm_leads")
    .select(LEAD_COLUMNS)
    .order("updated_at", { ascending: false })
    // §11: never load an unbounded table.
    .limit(300);

  const stage = LEAD_STAGES.find((s) => s === filters.stage);
  if (stage) query = query.eq("stage", stage);
  if (filters.q?.trim()) {
    const q = `%${filters.q.trim()}%`;
    query = query.or(`company_name.ilike.${q},contact_name.ilike.${q},reference.ilike.${q}`);
  }

  const { data, error } = await query;
  if (error) {
    // Swallowing this is how an empty timeline came to mean "the query broke"
    // as well as "nothing happened yet" — indistinguishable on screen.
    console.error("[crm] listLeads failed:", error.message);
    return [];
  }
  return ((data ?? []) as unknown as LeadRow[]).map(toLead);
}

export async function getLead(id: string): Promise<Lead | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("crm_leads").select(LEAD_COLUMNS).eq("id", id).maybeSingle();
  return data ? toLead(data as unknown as LeadRow) : null;
}

/** Counted in Postgres, so the column heading and the cards agree (§11). */
export async function getPipelineSummary(): Promise<Record<LeadStage, number>> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("crm_pipeline_summary");

  const counts = Object.fromEntries(LEAD_STAGES.map((s) => [s, 0])) as Record<LeadStage, number>;
  for (const row of data ?? []) {
    counts[row.stage as LeadStage] = Number(row.lead_count);
  }
  return counts;
}

/** The contact history for a lead or an agency — one table, so one query. */
export async function listActivities(
  subject: { leadId: string } | { agencyId: string },
): Promise<Activity[]> {
  const supabase = await createClient();
  let query = supabase
    .from("crm_activities")
    .select("id, kind, subject, body, occurred_at, author:profiles!crm_activities_created_by_fkey (full_name)")
    .order("occurred_at", { ascending: false })
    .limit(200);

  query =
    "leadId" in subject
      ? query.eq("lead_id", subject.leadId)
      : query.eq("agency_id", subject.agencyId);

  const { data, error } = await query;
  if (error) {
    console.error("[crm] listActivities failed:", error.message);
    return [];
  }
  return ((data ?? []) as unknown as {
    id: string;
    kind: string;
    subject: string;
    body: string | null;
    occurred_at: string;
    author: { full_name: string } | null;
  }[]).map((r) => ({
    id: r.id,
    kind: r.kind as ActivityKind,
    subject: r.subject,
    body: r.body,
    occurredAt: r.occurred_at,
    authorName: r.author?.full_name ?? null,
  }));
}

const TASK_COLUMNS =
  "id, title, notes, due_on, status, assigned_to, lead_id, agency_id, assignee:profiles!crm_tasks_assigned_to_fkey (full_name), lead:crm_leads (company_name), agency:agencies (name)";

type TaskRow = {
  id: string;
  title: string;
  notes: string | null;
  due_on: string;
  status: string;
  assigned_to: string | null;
  lead_id: string | null;
  agency_id: string | null;
  assignee: { full_name: string } | null;
  lead: { company_name: string } | null;
  agency: { name: string } | null;
};

function toTask(r: TaskRow): Task {
  return {
    id: r.id,
    title: r.title,
    notes: r.notes,
    dueOn: r.due_on,
    status: r.status as TaskStatus,
    assignedTo: r.assigned_to,
    assigneeName: r.assignee?.full_name ?? null,
    leadId: r.lead_id,
    agencyId: r.agency_id,
    subjectLabel: r.lead?.company_name ?? r.agency?.name ?? null,
  };
}

export async function listTasks(
  subject: { leadId: string } | { agencyId: string } | { open: true },
): Promise<Task[]> {
  const supabase = await createClient();
  let query = supabase.from("crm_tasks").select(TASK_COLUMNS).order("due_on").limit(200);

  if ("leadId" in subject) query = query.eq("lead_id", subject.leadId);
  else if ("agencyId" in subject) query = query.eq("agency_id", subject.agencyId);
  else query = query.eq("status", "open");

  const { data, error } = await query;
  if (error) {
    console.error("[crm] listTasks failed:", error.message);
    return [];
  }
  return ((data ?? []) as unknown as TaskRow[]).map(toTask);
}

/**
 * Agencies a lead may be linked to.
 *
 * Only APPROVED ones, and only those no other lead already claims — the RPC
 * refuses both anyway, so offering them would be offering a refusal.
 */
export async function listLinkableAgencies(): Promise<{ id: string; name: string; code: string }[]> {
  const supabase = await createClient();
  const [{ data: agencies }, { data: taken }] = await Promise.all([
    supabase
      .from("agencies")
      .select("id, name, code")
      .eq("status", "active")
      .order("name")
      .limit(500),
    supabase.from("crm_leads").select("agency_id").not("agency_id", "is", null),
  ]);

  const claimed = new Set((taken ?? []).map((r) => r.agency_id));
  return (agencies ?? []).filter((a) => !claimed.has(a.id));
}
