import { z } from "zod";

/**
 * Schemas for role and staff management (CLAUDE.md §7).
 * Messages are i18n keys, resolved by the form (§5).
 */

/** Machine key for a custom role. Must match the CHECK constraint on roles.key. */
const roleKey = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z][a-z0-9_]{2,49}$/, "access.validation.roleKeyInvalid");

const label = (msg: string) => z.string().trim().min(2, msg).max(120);

export const createRoleSchema = z.object({
  key: roleKey,
  nameAr: label("access.validation.nameArRequired"),
  nameEn: label("access.validation.nameEnRequired"),
  descriptionAr: z.string().trim().max(500).optional().or(z.literal("")),
  descriptionEn: z.string().trim().max(500).optional().or(z.literal("")),
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

/** The key is immutable after creation — code and audit rows refer to it. */
export const updateRoleSchema = createRoleSchema.omit({ key: true }).extend({
  id: z.string().uuid(),
});
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

export const setRolePermissionsSchema = z.object({
  roleId: z.string().uuid(),
  permissionKeys: z.array(z.string().min(1)).max(500),
});
export type SetRolePermissionsInput = z.infer<typeof setRolePermissionsSchema>;

export const createStaffSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "auth.validation.emailRequired")
    .email("auth.validation.emailInvalid"),
  fullName: label("auth.validation.nameRequired"),
  roleId: z.string().uuid("access.validation.roleRequired"),
});
export type CreateStaffInput = z.infer<typeof createStaffSchema>;

export const setUserStatusSchema = z.object({
  userId: z.string().uuid(),
  status: z.enum(["active", "suspended"]),
});

export const setUserRoleSchema = z.object({
  userId: z.string().uuid(),
  roleId: z.string().uuid(),
});
