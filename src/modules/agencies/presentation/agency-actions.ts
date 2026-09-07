"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/shared/lib/supabase/server";
import { describeDbError } from "@/shared/lib/db-error";
import { requirePermission } from "@/modules/auth/infrastructure/guard";
import {
  creditLimitSchema,
  rejectAgencySchema,
  updateAgencySchema,
} from "@/modules/agencies/application/schemas";

/**
 * Agency lifecycle actions (CLAUDE.md §13, Phase 2).
 *
 * Approve/reject/suspend go through SECURITY DEFINER RPCs because they change
 * more than one table and must not half-apply. Each RPC re-checks the caller's
 * permission itself, so the check here is a second, independent gate rather
 * than the only one (§12).
 */

export type Result =
  { ok: true; messageKey: string } | { ok: false; errorKey: string; detail?: string };

const FORBIDDEN: Result = { ok: false, errorKey: "access.errors.forbidden" };

function toResult(error: unknown, fallbackKey: string): Result {
  // Supabase rejects with a plain object, not an Error — see describeDbError.
  const message = describeDbError(error);
  if (/permission|not have|required|not found/i.test(message)) {
    return { ok: false, errorKey: "access.errors.refused", detail: message };
  }
  return { ok: false, errorKey: fallbackKey };
}

function revalidateAgencies() {
  revalidatePath("/[locale]/admin/agencies", "page");
  revalidatePath("/[locale]/admin/agencies/[id]", "page");
  revalidatePath("/[locale]/admin", "page");
}

export async function approveAgencyAction(agencyId: string): Promise<Result> {
  try {
    await requirePermission("agencies.approve");
  } catch {
    return FORBIDDEN;
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_agency", { p_agency_id: agencyId });
  if (error) return toResult(error, "agencies.errors.approveFailed");

  revalidateAgencies();
  return { ok: true, messageKey: "agencies.approved" };
}

export async function rejectAgencyAction(formData: FormData): Promise<Result> {
  try {
    await requirePermission("agencies.approve");
  } catch {
    return FORBIDDEN;
  }

  const parsed = rejectAgencySchema.safeParse({
    agencyId: formData.get("agencyId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { ok: false, errorKey: "agencies.errors.reasonRequired" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_agency", {
    p_agency_id: parsed.data.agencyId,
    p_reason: parsed.data.reason,
  });
  if (error) return toResult(error, "agencies.errors.rejectFailed");

  revalidateAgencies();
  return { ok: true, messageKey: "agencies.rejected" };
}

export async function setAgencyStatusAction(
  agencyId: string,
  status: "active" | "suspended",
): Promise<Result> {
  try {
    await requirePermission("agencies.suspend");
  } catch {
    return FORBIDDEN;
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_agency_status", {
    p_agency_id: agencyId,
    p_status: status,
  });
  if (error) return toResult(error, "agencies.errors.statusFailed");

  revalidateAgencies();
  return {
    ok: true,
    messageKey: status === "active" ? "agencies.reactivated" : "agencies.suspended",
  };
}

export async function setCreditLimitAction(formData: FormData): Promise<Result> {
  try {
    await requirePermission("agencies.credit_limit.update");
  } catch {
    return FORBIDDEN;
  }

  const parsed = creditLimitSchema.safeParse({
    agencyId: formData.get("agencyId"),
    creditLimit: formData.get("creditLimit"),
  });
  if (!parsed.success) return { ok: false, errorKey: "agencies.errors.creditLimitInvalid" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("agencies")
    .update({ credit_limit: parsed.data.creditLimit })
    .eq("id", parsed.data.agencyId);

  // The column-level trigger refuses this without the permission, so a caller
  // who slipped past the check above still cannot move the number.
  if (error) return toResult(error, "agencies.errors.creditLimitFailed");

  revalidateAgencies();
  return { ok: true, messageKey: "agencies.creditLimitUpdated" };
}

export async function updateAgencyAction(formData: FormData): Promise<Result> {
  try {
    await requirePermission("agencies.update");
  } catch {
    return FORBIDDEN;
  }

  const parsed = updateAgencySchema.safeParse({
    agencyId: formData.get("agencyId"),
    name: formData.get("name"),
    legalName: formData.get("legalName") ?? "",
    phone: formData.get("phone") ?? "",
    website: formData.get("website") ?? "",
    countryCode: formData.get("countryCode"),
    city: formData.get("city") ?? "",
    address: formData.get("address") ?? "",
    commercialRegNo: formData.get("commercialRegNo") ?? "",
    taxId: formData.get("taxId") ?? "",
  });
  if (!parsed.success) return { ok: false, errorKey: "access.errors.invalidInput" };

  const d = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase
    .from("agencies")
    .update({
      name: d.name,
      legal_name: d.legalName || null,
      phone: d.phone || null,
      website: d.website || null,
      country_code: d.countryCode,
      city: d.city || null,
      address: d.address || null,
      commercial_reg_no: d.commercialRegNo || null,
      tax_id: d.taxId || null,
    })
    .eq("id", d.agencyId);

  if (error) return toResult(error, "agencies.errors.updateFailed");

  revalidateAgencies();
  return { ok: true, messageKey: "agencies.updated" };
}
