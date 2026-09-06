import "server-only";

import { can, type AuthenticatedUser } from "@/modules/auth/domain/user";
import { getCurrentUser } from "./current-user";

/**
 * Server-side permission gate for mutating use-cases.
 *
 * CLAUDE.md §12: "Never trust a role/permission claim from the client — re-check
 * it server-side in the use-case layer for every mutating action." This is that
 * re-check. It is the *second* of three independent gates, not the only one:
 *
 *   1. the UI hides what you cannot do        (convenience)
 *   2. this guard, in the Server Action        (application layer)
 *   3. RLS / the RPC's own check               (the real boundary)
 *
 * Removing any one of the first two is a bug; removing the third is a breach.
 */

export class ForbiddenError extends Error {
  constructor(public readonly permission: string) {
    super(`Missing permission: ${permission}`);
    this.name = "ForbiddenError";
  }
}

export class UnauthenticatedError extends Error {
  constructor() {
    super("Not signed in");
    this.name = "UnauthenticatedError";
  }
}

/** Resolves the caller, or throws. Use when a page/action needs a user at all. */
export async function requireUser(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();
  if (!user || user.status !== "active") throw new UnauthenticatedError();
  return user;
}

/** Resolves the caller and asserts one permission, or throws. */
export async function requirePermission(permission: string): Promise<AuthenticatedUser> {
  const user = await requireUser();
  if (!can(user, permission)) throw new ForbiddenError(permission);
  return user;
}
