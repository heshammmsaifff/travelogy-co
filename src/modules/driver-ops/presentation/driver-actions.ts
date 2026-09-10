"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient, createServiceRoleClient } from "@/shared/lib/supabase/server";
import { describeDbError } from "@/shared/lib/db-error";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import { requirePermission } from "@/modules/auth/infrastructure/guard";
import {
  advanceAssignmentSchema,
  assignDriverSchema,
  createDriverSchema,
  updateDriverSchema,
} from "@/modules/driver-ops/application/schemas";

/**
 * Driver operations mutations (CLAUDE.md §13, Phase 8b).
 *
 * Assignment and status live in RPCs, because the seat, the clash and the
 * state machine have to be decided together (§15, 10.5). Creating a driver is
 * the exception: it needs an auth user, which only the service role can make —
 * so it follows the staff-creation flow exactly (§15, 3.4), including the
 * temporary password shown once and the must-change-password flag.
 */

export type Result =
  | { ok: true; messageKey: string; secret?: string }
  | { ok: false; errorKey: string; detail?: string };

const FORBIDDEN: Result = { ok: false, errorKey: "access.errors.forbidden" };

function invalid(issue: string | undefined): Result {
  return { ok: false, errorKey: "drivers.errors.invalidInput", detail: issue };
}

function revalidateDrivers() {
  revalidatePath("/[locale]/admin/drivers", "page");
  revalidatePath("/[locale]/admin/dispatch", "page");
}

function revalidateJobs() {
  revalidatePath("/[locale]/admin/dispatch", "page");
  revalidatePath("/[locale]/driver", "page");
}

// ----------------------------------------------------------------- drivers

export async function createDriverAction(formData: FormData): Promise<Result> {
  try {
    await requirePermission("drivers.manage");
  } catch {
    return FORBIDDEN;
  }

  const parsed = createDriverSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
  const d = parsed.data;

  const supabase = await createClient();
  const { data: role } = await supabase
    .from("roles")
    .select("id")
    .eq("key", "driver")
    .maybeSingle();
  if (!role) return { ok: false, errorKey: "drivers.errors.saveFailed" };

  // 24 random bytes -> 32 base64url characters, replaced on first sign-in.
  const tempPassword = randomBytes(24).toString("base64url");

  // Creating an auth user is privileged and has no user-facing equivalent; the
  // permission check above is what authorises it.
  const admin = createServiceRoleClient();
  const { data: created, error } = await admin.auth.admin.createUser({
    email: d.email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: d.fullName },
  });

  if (error || !created.user) {
    if (error?.message?.includes("already")) {
      return { ok: false, errorKey: "drivers.errors.emailTaken" };
    }
    console.error("[drivers] auth user creation failed:", error?.message);
    return { ok: false, errorKey: "drivers.errors.saveFailed" };
  }

  const { data: signupProfile } = await admin
    .from("profiles")
    .select("agency_id")
    .eq("id", created.user.id)
    .maybeSingle();

  const { error: profileError } = await admin
    .from("profiles")
    .update({
      role_id: role.id,
      status: "active",
      agency_id: null,
      full_name: d.fullName,
      phone: d.phone,
      must_change_password: true,
      approved_at: new Date().toISOString(),
    })
    .eq("id", created.user.id);

  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
    return { ok: false, errorKey: "drivers.errors.saveFailed" };
  }

  // The signup trigger may have created an agency for the new account. A driver
  // belongs to none, and an agency with no members sits in the approval queue
  // forever (§15, 5.2).
  if (signupProfile?.agency_id) {
    await admin.from("agencies").delete().eq("id", signupProfile.agency_id);
  }

  const { error: driverError } = await admin.from("drivers").insert({
    profile_id: created.user.id,
    code: d.code,
    phone: d.phone,
    licence_number: d.licenceNumber ?? null,
    licence_expiry: d.licenceExpiry ?? null,
    default_vehicle_type_id: d.defaultVehicleTypeId ?? null,
    notes: d.notes ?? null,
    is_active: true,
  });

  if (driverError) {
    // Do not leave an account behind that no dispatch screen can reach.
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
    const message = describeDbError(driverError);
    if (/duplicate key|drivers_code_key/i.test(message)) {
      return { ok: false, errorKey: "drivers.errors.duplicate" };
    }
    console.error("[drivers] driver row creation failed:", message);
    return { ok: false, errorKey: "drivers.errors.saveFailed" };
  }

  revalidateDrivers();
  return { ok: true, messageKey: "drivers.saved", secret: tempPassword };
}

export async function updateDriverAction(formData: FormData): Promise<Result> {
  try {
    await requirePermission("drivers.manage");
  } catch {
    return FORBIDDEN;
  }

  const parsed = updateDriverSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
  const d = parsed.data;

  const supabase = await createClient();
  const { data: driver } = await supabase
    .from("drivers")
    .select("profile_id")
    .eq("id", d.id)
    .maybeSingle();
  if (!driver) return { ok: false, errorKey: "drivers.errors.saveFailed" };

  const { error } = await supabase
    .from("drivers")
    .update({
      code: d.code,
      phone: d.phone,
      licence_number: d.licenceNumber ?? null,
      licence_expiry: d.licenceExpiry ?? null,
      default_vehicle_type_id: d.defaultVehicleTypeId ?? null,
      notes: d.notes ?? null,
    })
    .eq("id", d.id);

  if (error) {
    const message = describeDbError(error);
    if (/duplicate key|drivers_code_key/i.test(message)) {
      return { ok: false, errorKey: "drivers.errors.duplicate" };
    }
    console.error("[drivers] update failed:", message);
    return { ok: false, errorKey: "drivers.errors.saveFailed" };
  }

  // The display name lives on `profiles`, which `drivers.manage` may read but
  // not write (§15, Phase 8b) — so the rename goes through the service role
  // after the permission has already been checked above.
  const admin = createServiceRoleClient();
  await admin.from("profiles").update({ full_name: d.fullName }).eq("id", driver.profile_id);

  revalidateDrivers();
  return { ok: true, messageKey: "drivers.saved" };
}

export async function setDriverActiveAction(
  driverId: string,
  active: boolean,
): Promise<Result> {
  try {
    await requirePermission("drivers.manage");
  } catch {
    return FORBIDDEN;
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_driver_active", {
    p_driver_id: driverId,
    p_active: active,
  });

  if (error) {
    console.error("[drivers] set_driver_active failed:", describeDbError(error));
    return { ok: false, errorKey: "drivers.errors.saveFailed" };
  }

  revalidateDrivers();
  return { ok: true, messageKey: active ? "drivers.activated" : "drivers.deactivated" };
}

// --------------------------------------------------------------- dispatch

/** The database names each refusal; each one is something the dispatcher can act on. */
function describeAssignFailure(error: unknown): Result {
  const message = describeDbError(error);
  if (/already has a driver/i.test(message)) {
    return { ok: false, errorKey: "drivers.errors.seatTaken" };
  }
  if (/already on this transfer/i.test(message)) {
    return { ok: false, errorKey: "drivers.errors.alreadyOnTransfer" };
  }
  if (/already booked at that time/i.test(message)) {
    return { ok: false, errorKey: "drivers.errors.clash" };
  }
  if (/not active/i.test(message)) {
    return { ok: false, errorKey: "drivers.errors.inactiveDriver" };
  }
  if (/booking is cancelled/i.test(message)) {
    return { ok: false, errorKey: "drivers.errors.cancelledBooking" };
  }
  console.error("[dispatch] assign_driver failed:", message);
  return { ok: false, errorKey: "drivers.errors.assignFailed" };
}

export async function assignDriverAction(formData: FormData): Promise<Result> {
  try {
    await requirePermission("dispatch.manage");
  } catch {
    return FORBIDDEN;
  }

  const parsed = assignDriverSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
  const d = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_driver", {
    p_transfer_item_id: d.transferItemId,
    p_driver_id: d.driverId,
    p_vehicle_seq: d.vehicleSeq,
  });

  if (error) return describeAssignFailure(error);

  revalidateJobs();
  return { ok: true, messageKey: "drivers.assigned" };
}

export async function unassignDriverAction(assignmentId: string): Promise<Result> {
  try {
    await requirePermission("dispatch.manage");
  } catch {
    return FORBIDDEN;
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("unassign_driver", { p_assignment_id: assignmentId });

  if (error) {
    const message = describeDbError(error);
    if (/already started/i.test(message)) {
      return { ok: false, errorKey: "drivers.errors.jobStarted" };
    }
    console.error("[dispatch] unassign_driver failed:", message);
    return { ok: false, errorKey: "drivers.errors.assignFailed" };
  }

  revalidateJobs();
  return { ok: true, messageKey: "drivers.unassigned" };
}

// ---------------------------------------------------------- the driver's own

/**
 * The one write a driver makes.
 *
 * Authorisation is the RPC's: it checks that the caller IS the assigned driver
 * (or dispatch). This layer only confirms there is an active session, because
 * a driver holds no permission keys at all — their access comes from the row,
 * not from a grant.
 */
export async function advanceAssignmentAction(formData: FormData): Promise<Result> {
  const user = await getCurrentUser();
  if (!user || user.status !== "active") return FORBIDDEN;

  const parsed = advanceAssignmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
  const d = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("advance_assignment", {
    p_assignment_id: d.assignmentId,
    p_status: d.status,
    p_notes: d.notes,
  });

  if (error) {
    const message = describeDbError(error);
    if (/backwards/i.test(message)) return { ok: false, errorKey: "driver.errors.backwards" };
    if (/already closed/i.test(message)) return { ok: false, errorKey: "driver.errors.closed" };
    if (/not permitted/i.test(message)) return { ok: false, errorKey: "driver.errors.forbidden" };
    console.error("[driver] advance_assignment failed:", message);
    return { ok: false, errorKey: "driver.errors.updateFailed" };
  }

  revalidateJobs();
  return { ok: true, messageKey: "drivers.advanced" };
}
