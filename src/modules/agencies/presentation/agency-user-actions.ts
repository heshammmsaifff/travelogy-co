"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient, createServiceRoleClient } from "@/shared/lib/supabase/server";
import { describeDbError } from "@/shared/lib/db-error";
import { can } from "@/modules/auth/domain/user";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import {
  createAgencyUserSchema,
  setAgencyUserStatusSchema,
} from "@/modules/agencies/application/schemas";

export type Result =
  | { ok: true; messageKey: string; secret?: string }
  | { ok: false; errorKey: string; detail?: string };

const FORBIDDEN: Result = { ok: false, errorKey: "access.errors.forbidden" };

function toResult(error: unknown, fallbackKey: string): Result {
  const message = describeDbError(error);
  if (/permission|not have|cannot|not found|last active|refused/i.test(message)) {
    return { ok: false, errorKey: "access.errors.refused", detail: message };
  }
  return { ok: false, errorKey: fallbackKey };
}

function revalidateAgencyUsers(agencyId: string) {
  revalidatePath(`/[locale]/admin/agencies/${agencyId}`, "page");
  revalidatePath("/[locale]/admin/agencies/[id]", "page");
  revalidatePath("/[locale]/agent/team", "page");
}

export async function createAgencyUserAction(formData: FormData): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return FORBIDDEN;

  const parsed = createAgencyUserSchema.safeParse({
    agencyId: formData.get("agencyId"),
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    roleId: formData.get("roleId"),
  });
  if (!parsed.success) return { ok: false, errorKey: "access.errors.invalidInput" };

  const d = parsed.data;

  // Authorization: either a back-office admin who manages agencies,
  // or an agency team manager inside their own agency.
  const isBackOffice = can(user, "agencies.update");
  const isAgencyManager = can(user, "agency_users.manage") && user.agency?.id === d.agencyId;

  if (!isBackOffice && !isAgencyManager) {
    return FORBIDDEN;
  }

  const supabase = await createClient();

  // Validate that the assigned role belongs to the 'agent' scope
  const { data: role } = await supabase
    .from("roles")
    .select("key, scope")
    .eq("id", d.roleId)
    .maybeSingle();

  if (!role || role.scope !== "agent") {
    return { ok: false, errorKey: "agencies.errors.roleNotAgent" };
  }

  // 24 random bytes -> 32 base64url characters.
  const tempPassword = randomBytes(24).toString("base64url");
  const admin = createServiceRoleClient();

  const { data: created, error } = await admin.auth.admin.createUser({
    email: d.email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: d.fullName },
  });

  if (error || !created.user) {
    if (error?.message?.includes("already")) {
      return { ok: false, errorKey: "access.errors.emailTaken" };
    }
    return toResult(error, "agencies.members.createFailed");
  }

  // The signup trigger created a pending agent_owner profile with no agency.
  // Update it to attach to the target agency with the chosen agent role.
  const { error: profileError } = await admin
    .from("profiles")
    .update({
      role_id: d.roleId,
      agency_id: d.agencyId,
      full_name: d.fullName,
      status: "active",
      must_change_password: true,
      approved_at: new Date().toISOString(),
    })
    .eq("id", created.user.id);

  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
    return toResult(profileError, "agencies.members.createFailed");
  }

  revalidateAgencyUsers(d.agencyId);
  return { ok: true, messageKey: "agencies.members.created", secret: tempPassword };
}

export async function setAgencyUserStatusAction(
  agencyId: string,
  userId: string,
  status: "active" | "suspended",
): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return FORBIDDEN;

  const parsed = setAgencyUserStatusSchema.safeParse({ agencyId, userId, status });
  if (!parsed.success) return { ok: false, errorKey: "access.errors.invalidInput" };

  const isBackOffice = can(user, "agencies.suspend") || can(user, "agencies.approve");
  const isAgencyManager = can(user, "agency_users.manage") && user.agency?.id === agencyId;

  if (!isBackOffice && !isAgencyManager) {
    return FORBIDDEN;
  }

  if (user.id === userId) {
    return { ok: false, errorKey: "agencies.errors.cannotChangeSelfStatus" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.userId)
    .eq("agency_id", parsed.data.agencyId);

  if (error) return toResult(error, "agencies.errors.updateStatusFailed");

  revalidateAgencyUsers(agencyId);
  return {
    ok: true,
    messageKey: status === "active" ? "agencies.members.reactivated" : "agencies.members.suspended",
  };
}
