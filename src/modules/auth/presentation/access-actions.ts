"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient, createServiceRoleClient } from "@/shared/lib/supabase/server";
import { describeDbError } from "@/shared/lib/db-error";
import { requirePermission } from "@/modules/auth/infrastructure/guard";
import { can } from "@/modules/auth/domain/user";
import {
  createRoleSchema,
  createStaffSchema,
  setRolePermissionsSchema,
  setUserRoleSchema,
  setUserStatusSchema,
  updateRoleSchema,
} from "@/modules/auth/application/access.schemas";

/**
 * Role and staff management actions (CLAUDE.md §7).
 *
 * Every one: check the permission (§12), validate with Zod (§12), perform one
 * operation, revalidate. Errors come back as i18n keys, never raw provider text.
 */

export type Result =
  | { ok: true; messageKey: string; secret?: string }
  | { ok: false; errorKey: string; detail?: string };

const FORBIDDEN: Result = { ok: false, errorKey: "access.errors.forbidden" };

/** Maps a thrown database/permission error onto a message key. */
function toResult(error: unknown, fallbackKey: string): Result {
  // Supabase rejects with a plain object, not an Error — see describeDbError.
  const message = describeDbError(error);
  // 42501 is our convention for "refused by a protection trigger"; those
  // messages are written for humans, so they are safe to surface.
  if (/permission|not have|cannot|last active super admin|system role/i.test(message)) {
    return { ok: false, errorKey: "access.errors.refused", detail: message };
  }
  return { ok: false, errorKey: fallbackKey };
}

// ------------------------------------------------------------------- roles

export async function createRoleAction(formData: FormData): Promise<Result> {
  try {
    await requirePermission("settings.roles.manage");
  } catch {
    return FORBIDDEN;
  }

  const parsed = createRoleSchema.safeParse({
    key: formData.get("key"),
    scope: formData.get("scope") || "admin",
    nameAr: formData.get("nameAr"),
    nameEn: formData.get("nameEn"),
    descriptionAr: formData.get("descriptionAr") ?? "",
    descriptionEn: formData.get("descriptionEn") ?? "",
  });
  if (!parsed.success) return { ok: false, errorKey: "access.errors.invalidInput" };

  const d = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase.from("roles").insert({
    key: d.key,
    scope: d.scope,
    name_ar: d.nameAr,
    name_en: d.nameEn,
    description_ar: d.descriptionAr || null,
    description_en: d.descriptionEn || null,
    is_system: false,
  });

  if (error) {
    if (error.code === "23505") return { ok: false, errorKey: "access.errors.roleKeyTaken" };
    return toResult(error, "access.errors.createRoleFailed");
  }

  revalidatePath("/[locale]/admin/roles", "page");
  return { ok: true, messageKey: "access.roles.created" };
}

export async function updateRoleAction(formData: FormData): Promise<Result> {
  try {
    await requirePermission("settings.roles.manage");
  } catch {
    return FORBIDDEN;
  }

  const parsed = updateRoleSchema.safeParse({
    id: formData.get("id"),
    nameAr: formData.get("nameAr"),
    nameEn: formData.get("nameEn"),
    descriptionAr: formData.get("descriptionAr") ?? "",
    descriptionEn: formData.get("descriptionEn") ?? "",
  });
  if (!parsed.success) return { ok: false, errorKey: "access.errors.invalidInput" };

  const d = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase
    .from("roles")
    .update({
      name_ar: d.nameAr,
      name_en: d.nameEn,
      description_ar: d.descriptionAr || null,
      description_en: d.descriptionEn || null,
    })
    .eq("id", d.id);

  if (error) return toResult(error, "access.errors.updateRoleFailed");

  revalidatePath("/[locale]/admin/roles", "page");
  return { ok: true, messageKey: "access.roles.updated" };
}

export async function deleteRoleAction(roleId: string): Promise<Result> {
  try {
    await requirePermission("settings.roles.manage");
  } catch {
    return FORBIDDEN;
  }

  const supabase = await createClient();

  // A role still assigned to someone cannot be removed: profiles.role_id is
  // ON DELETE RESTRICT, so the database would refuse anyway — but saying why
  // is better than surfacing a foreign-key error.
  const { count } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("role_id", roleId);

  if ((count ?? 0) > 0) return { ok: false, errorKey: "access.errors.roleInUse" };

  const { error } = await supabase.from("roles").delete().eq("id", roleId);
  if (error) return toResult(error, "access.errors.deleteRoleFailed");

  revalidatePath("/[locale]/admin/roles", "page");
  return { ok: true, messageKey: "access.roles.deleted" };
}

/**
 * Replaces a role's permission set with exactly the keys submitted.
 *
 * Diffed rather than delete-all-then-insert, so the audit trail records the
 * individual grants and revocations instead of a churn of every permission
 * every time somebody ticks one box.
 */
export async function setRolePermissionsAction(formData: FormData): Promise<Result> {
  let actor;
  try {
    actor = await requirePermission("settings.roles.manage");
  } catch {
    return FORBIDDEN;
  }

  const parsed = setRolePermissionsSchema.safeParse({
    roleId: formData.get("roleId"),
    permissionKeys: formData.getAll("permissions").map(String),
  });
  if (!parsed.success) return { ok: false, errorKey: "access.errors.invalidInput" };

  const { roleId, permissionKeys } = parsed.data;
  const supabase = await createClient();

  const { data: role } = await supabase.from("roles").select("key").eq("id", roleId).maybeSingle();
  if (!role) return { ok: false, errorKey: "access.errors.roleNotFound" };
  if (role.key === "super_admin")
    return { ok: false, errorKey: "access.errors.superAdminImplicit" };

  // CLAUDE.md §7 rule 5, checked here as well as in the database trigger so the
  // user gets a clear message instead of a raw exception.
  if (!can(actor, "settings.roles.manage")) return FORBIDDEN;
  const notHeld = permissionKeys.filter((k) => !can(actor, k));
  if (notHeld.length > 0) {
    return { ok: false, errorKey: "access.errors.cannotGrantUnheld", detail: notHeld.join(", ") };
  }

  const { data: current } = await supabase
    .from("role_permissions")
    .select("permission_key")
    .eq("role_id", roleId);

  const currentKeys = new Set((current ?? []).map((r) => r.permission_key));
  const nextKeys = new Set(permissionKeys);

  const toAdd = [...nextKeys].filter((k) => !currentKeys.has(k));
  const toRemove = [...currentKeys].filter((k) => !nextKeys.has(k));

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("role_permissions")
      .delete()
      .eq("role_id", roleId)
      .in("permission_key", toRemove);
    if (error) return toResult(error, "access.errors.updatePermissionsFailed");
  }

  if (toAdd.length > 0) {
    const { error } = await supabase
      .from("role_permissions")
      .insert(toAdd.map((k) => ({ role_id: roleId, permission_key: k, granted_by: actor.id })));
    if (error) return toResult(error, "access.errors.updatePermissionsFailed");
  }

  revalidatePath("/[locale]/admin/roles", "page");
  return { ok: true, messageKey: "access.roles.permissionsUpdated" };
}

// ------------------------------------------------------------------- staff

/**
 * Creates a back-office account with a generated temporary password.
 *
 * Why a temporary password rather than an emailed invite: Supabase's built-in
 * SMTP is rate-limited to a handful of messages an hour, so an invite-based
 * flow would silently fail in this project's current configuration. The
 * password is returned to the admin once, to be passed on out of band, and
 * `must_change_password` forces the new user to replace it at first sign-in.
 *
 * Switch to inviteUserByEmail once a real SMTP provider is configured.
 */
export async function createStaffAction(formData: FormData): Promise<Result> {
  try {
    await requirePermission("staff.create");
  } catch {
    return FORBIDDEN;
  }

  const parsed = createStaffSchema.safeParse({
    email: formData.get("email"),
    fullName: formData.get("fullName"),
    roleId: formData.get("roleId"),
  });
  if (!parsed.success) return { ok: false, errorKey: "access.errors.invalidInput" };

  const d = parsed.data;
  const supabase = await createClient();

  // Only back-office roles, and never super_admin — promoting to super_admin is
  // a separate, deliberate act by an existing super_admin.
  const { data: role } = await supabase
    .from("roles")
    .select("key, scope")
    .eq("id", d.roleId)
    .maybeSingle();

  if (!role || role.scope !== "admin") return { ok: false, errorKey: "access.errors.roleNotAdmin" };
  if (role.key === "super_admin")
    return { ok: false, errorKey: "access.errors.cannotCreateSuperAdmin" };

  // 24 random bytes -> 32 base64url chars. Well beyond guessing, and the user
  // replaces it immediately anyway.
  const tempPassword = randomBytes(24).toString("base64url");

  // Service role: creating an auth user is a privileged operation with no
  // user-facing equivalent. The permission check above is what authorises it.
  const admin = createServiceRoleClient();

  const { data: created, error } = await admin.auth.admin.createUser({
    email: d.email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: d.fullName },
  });

  if (error || !created.user) {
    if (error?.message?.includes("already"))
      return { ok: false, errorKey: "access.errors.emailTaken" };
    return toResult(error, "access.errors.createStaffFailed");
  }

  // The signup trigger created a pending agent_owner profile with no agency;
  // convert it into the intended staff account.
  const { error: profileError } = await admin
    .from("profiles")
    .update({
      role_id: d.roleId,
      status: "active",
      agency_id: null,
      full_name: d.fullName,
      must_change_password: true,
      approved_at: new Date().toISOString(),
    })
    .eq("id", created.user.id);

  if (profileError) {
    // Do not leave a half-created account behind.
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
    return toResult(profileError, "access.errors.createStaffFailed");
  }

  revalidatePath("/[locale]/admin/staff", "page");
  return { ok: true, messageKey: "access.staff.created", secret: tempPassword };
}

export async function setStaffStatusAction(
  userId: string,
  status: "active" | "suspended",
): Promise<Result> {
  try {
    await requirePermission("staff.suspend");
  } catch {
    return FORBIDDEN;
  }

  const parsed = setUserStatusSchema.safeParse({ userId, status });
  if (!parsed.success) return { ok: false, errorKey: "access.errors.invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.userId);

  // The last-super-admin trigger may refuse this; its message is user-facing.
  if (error) return toResult(error, "access.errors.updateStaffFailed");

  revalidatePath("/[locale]/admin/staff", "page");
  return {
    ok: true,
    messageKey: status === "active" ? "access.staff.reactivated" : "access.staff.suspended",
  };
}

export async function setStaffRoleAction(userId: string, roleId: string): Promise<Result> {
  try {
    await requirePermission("staff.update");
  } catch {
    return FORBIDDEN;
  }

  const parsed = setUserRoleSchema.safeParse({ userId, roleId });
  if (!parsed.success) return { ok: false, errorKey: "access.errors.invalidInput" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ role_id: parsed.data.roleId })
    .eq("id", parsed.data.userId);

  // Assigning super_admin is refused by the database unless the caller is one.
  if (error) return toResult(error, "access.errors.updateStaffFailed");

  revalidatePath("/[locale]/admin/staff", "page");
  return { ok: true, messageKey: "access.staff.roleUpdated" };
}
