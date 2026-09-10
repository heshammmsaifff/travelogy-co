"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/shared/lib/supabase/server";
import { describeDbError } from "@/shared/lib/db-error";
import { requirePermission } from "@/modules/auth/infrastructure/guard";
import {
  activitySchema,
  convertLeadSchema,
  leadSchema,
  taskSchema,
} from "@/modules/crm/application/schemas";

/**
 * CRM mutations (CLAUDE.md §13, Phase 8d).
 *
 * Two of these are RPCs rather than updates, and for the same reason each
 * time: a pair of columns has to move together and half of it applied is
 * worse than none (§15, 3.3). Winning a lead sets the stage AND the agency
 * snapshot; completing a task sets the status AND the completion time, which
 * a CHECK binds to each other.
 */

export type Result =
  | { ok: true; messageKey: string; leadId?: string }
  | { ok: false; errorKey: string; detail?: string };

const FORBIDDEN: Result = { ok: false, errorKey: "access.errors.forbidden" };

function invalid(issue: string | undefined): Result {
  return { ok: false, errorKey: "crm.errors.invalidInput", detail: issue };
}

/**
 * `revalidatePath` matches ROUTE PATTERNS, not concrete URLs.
 *
 * Passing an interpolated id — `/admin/crm/<uuid>` — names a path Next has
 * never heard of, so the call quietly does nothing and the detail page keeps
 * serving what it had. Found by logging a call and watching the timeline still
 * say "no contact logged yet" while the row sat in the database: a screen
 * denying something that exists is the same lie as one claiming something that
 * does not (§2.3).
 */
function revalidateCrm(leadId?: string, agencyId?: string) {
  revalidatePath("/[locale]/admin/crm", "page");
  if (leadId) revalidatePath("/[locale]/admin/crm/[id]", "page");
  if (agencyId) revalidatePath("/[locale]/admin/agencies/[id]", "page");
}

// ------------------------------------------------------------------- leads

export async function saveLeadAction(formData: FormData): Promise<Result> {
  let actor;
  try {
    actor = await requirePermission("crm.manage");
  } catch {
    return FORBIDDEN;
  }

  const parsed = leadSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    // The two refinements carry message keys the toast can resolve; the rest
    // are Zod's own text and go through as a detail.
    if (issue?.message?.startsWith("crm.errors.")) {
      return { ok: false, errorKey: issue.message };
    }
    return invalid(issue?.message);
  }

  const d = parsed.data;
  const payload = {
    company_name: d.companyName,
    contact_name: d.contactName ?? null,
    email: d.email ?? null,
    phone: d.phone ?? null,
    country_code: d.countryCode ?? null,
    city: d.city ?? null,
    source: d.source,
    stage: d.stage,
    owner_id: d.ownerId ?? null,
    // A lead that is no longer lost must not keep the reason it was.
    lost_reason: d.stage === "lost" ? (d.lostReason ?? null) : null,
    notes: d.notes ?? null,
  };

  const supabase = await createClient();
  const { data, error } = d.id
    ? await supabase.from("crm_leads").update(payload).eq("id", d.id).select("id").maybeSingle()
    : await supabase
        .from("crm_leads")
        .insert({ ...payload, created_by: actor.id })
        .select("id")
        .maybeSingle();

  if (error) {
    const message = describeDbError(error);
    if (/crm_leads_lost_has_reason/i.test(message)) {
      return { ok: false, errorKey: "crm.errors.lostNeedsReason" };
    }
    if (/crm_leads_won_has_agency/i.test(message)) {
      return { ok: false, errorKey: "crm.errors.wonNeedsAgency" };
    }
    console.error("[crm] lead save failed:", message);
    return { ok: false, errorKey: "crm.errors.saveFailed" };
  }

  revalidateCrm(data?.id ?? (d.id || undefined));
  return { ok: true, messageKey: "crm.saved", leadId: data?.id };
}

export async function deleteLeadAction(id: string): Promise<Result> {
  try {
    await requirePermission("crm.manage");
  } catch {
    return FORBIDDEN;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("crm_leads").delete().eq("id", id);
  if (error) {
    console.error("[crm] lead delete failed:", describeDbError(error));
    return { ok: false, errorKey: "crm.errors.saveFailed" };
  }

  revalidateCrm();
  return { ok: true, messageKey: "crm.deleted" };
}

export async function convertLeadAction(formData: FormData): Promise<Result> {
  try {
    await requirePermission("crm.manage");
  } catch {
    return FORBIDDEN;
  }

  const parsed = convertLeadSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);

  const supabase = await createClient();
  const { error } = await supabase.rpc("convert_lead", {
    p_lead_id: parsed.data.leadId,
    p_agency_id: parsed.data.agencyId,
  });

  if (error) {
    const message = describeDbError(error);
    if (/already been won/i.test(message)) return { ok: false, errorKey: "crm.errors.alreadyWon" };
    if (/already linked/i.test(message)) return { ok: false, errorKey: "crm.errors.agencyTaken" };
    if (/agency no longer exists/i.test(message)) {
      return { ok: false, errorKey: "crm.errors.agencyGone" };
    }
    if (/lead no longer exists/i.test(message)) return { ok: false, errorKey: "crm.errors.notFound" };
    console.error("[crm] convert_lead failed:", message);
    return { ok: false, errorKey: "crm.errors.saveFailed" };
  }

  revalidateCrm(parsed.data.leadId, parsed.data.agencyId);
  return { ok: true, messageKey: "crm.converted" };
}

// -------------------------------------------------------------- activities

export async function logActivityAction(formData: FormData): Promise<Result> {
  let actor;
  try {
    actor = await requirePermission("crm.manage");
  } catch {
    return FORBIDDEN;
  }

  const parsed = activitySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);

  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("crm_activities").insert({
    lead_id: d.leadId ?? null,
    agency_id: d.agencyId ?? null,
    kind: d.kind,
    subject: d.subject,
    body: d.body ?? null,
    // When it HAPPENED, not when it was typed. A call logged the next morning
    // belongs on the day of the call or the timeline lies about the order.
    occurred_at: d.occurredAt ? new Date(d.occurredAt).toISOString() : new Date().toISOString(),
    created_by: actor.id,
  });

  if (error) {
    console.error("[crm] activity failed:", describeDbError(error));
    return { ok: false, errorKey: "crm.errors.saveFailed" };
  }

  revalidateCrm(d.leadId, d.agencyId);
  return { ok: true, messageKey: "crm.activityLogged" };
}

export async function deleteActivityAction(
  id: string,
  subject: { leadId?: string; agencyId?: string },
): Promise<Result> {
  try {
    await requirePermission("crm.manage");
  } catch {
    return FORBIDDEN;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("crm_activities").delete().eq("id", id);
  if (error) return { ok: false, errorKey: "crm.errors.saveFailed" };

  revalidateCrm(subject.leadId, subject.agencyId);
  return { ok: true, messageKey: "crm.deleted" };
}

// ------------------------------------------------------------------- tasks

export async function saveTaskAction(formData: FormData): Promise<Result> {
  let actor;
  try {
    actor = await requirePermission("crm.manage");
  } catch {
    return FORBIDDEN;
  }

  const parsed = taskSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);

  const d = parsed.data;
  const payload = {
    lead_id: d.leadId ?? null,
    agency_id: d.agencyId ?? null,
    title: d.title,
    notes: d.notes ?? null,
    due_on: d.dueOn,
    assigned_to: d.assignedTo ?? null,
  };

  const supabase = await createClient();
  const { error } = d.id
    ? await supabase.from("crm_tasks").update(payload).eq("id", d.id)
    : await supabase.from("crm_tasks").insert({ ...payload, created_by: actor.id });

  if (error) {
    console.error("[crm] task save failed:", describeDbError(error));
    return { ok: false, errorKey: "crm.errors.saveFailed" };
  }

  revalidateCrm(d.leadId, d.agencyId);
  return { ok: true, messageKey: "crm.taskSaved" };
}

/**
 * Completing or reopening a task.
 *
 * Through the RPC because `status` and `completed_at` are bound by a CHECK —
 * moving one without the other is refused by the table, so no screen has to
 * remember the pairing.
 */
export async function setTaskStatusAction(
  taskId: string,
  status: "open" | "done" | "cancelled",
  subject: { leadId?: string; agencyId?: string } = {},
): Promise<Result> {
  try {
    await requirePermission("crm.manage");
  } catch {
    return FORBIDDEN;
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_task_status", {
    p_task_id: taskId,
    p_status: status,
  });

  if (error) {
    console.error("[crm] set_task_status failed:", describeDbError(error));
    return { ok: false, errorKey: "crm.errors.saveFailed" };
  }

  revalidateCrm(subject.leadId, subject.agencyId);
  return { ok: true, messageKey: "crm.taskSaved" };
}

export async function deleteTaskAction(
  id: string,
  subject: { leadId?: string; agencyId?: string },
): Promise<Result> {
  try {
    await requirePermission("crm.manage");
  } catch {
    return FORBIDDEN;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("crm_tasks").delete().eq("id", id);
  if (error) return { ok: false, errorKey: "crm.errors.saveFailed" };

  revalidateCrm(subject.leadId, subject.agencyId);
  return { ok: true, messageKey: "crm.deleted" };
}
