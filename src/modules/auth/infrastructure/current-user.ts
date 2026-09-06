import "server-only";

import { cache } from "react";
import { createClient } from "@/shared/lib/supabase/server";
import type { AuthenticatedUser, RoleScope, UserStatus } from "@/modules/auth/domain/user";

/**
 * Loads the signed-in user, their role and their resolved permissions.
 *
 * Wrapped in React's `cache()` so a request that asks several times — a layout,
 * a page and a couple of components all needing the user — costs exactly one
 * round trip (CLAUDE.md §11).
 *
 * Returns null for a signed-out visitor. Callers must treat "null" and
 * "signed in but not active" as different: a pending user has a valid session
 * and needs to reach the waiting screen.
 */
export const getCurrentUser = cache(async (): Promise<AuthenticatedUser | null> => {
  const supabase = await createClient();

  // getUser() revalidates the JWT against Supabase rather than trusting the
  // cookie, which is what makes it safe to use for an authorization decision.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Explicit column list, no select('*') (CLAUDE.md §11).
  const { data: profile } = await supabase
    .from("profiles")
    .select(
      `id, email, full_name, status, preferred_locale, role_id,
       roles!inner ( id, key, scope, name_ar, name_en ),
       agencies ( id, code, name, status )`,
    )
    .eq("id", user.id)
    .single();

  if (!profile) {
    // A session whose profile is missing is not a usable identity. This should
    // be impossible (the signup trigger is in the same transaction as the
    // auth.users insert), so treat it as signed-out rather than guessing.
    return null;
  }

  const role = profile.roles;
  const agency = profile.agencies;

  // super_admin's permissions are implicit; the join returns nothing for it,
  // which is exactly why `can()` must be used instead of reading this array.
  const { data: grants } = await supabase
    .from("role_permissions")
    .select("permission_key")
    .eq("role_id", profile.role_id);

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    status: profile.status as UserStatus,
    preferredLocale: profile.preferred_locale === "en" ? "en" : "ar",
    role: {
      id: role.id,
      key: role.key,
      scope: role.scope as RoleScope,
      nameAr: role.name_ar,
      nameEn: role.name_en,
    },
    agency: agency
      ? {
          id: agency.id,
          code: agency.code,
          name: agency.name,
          status: agency.status as UserStatus,
        }
      : null,
    permissions: (grants ?? []).map((g) => g.permission_key),
  };
});
