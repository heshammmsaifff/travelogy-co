/**
 * Auth domain types.
 *
 * No framework imports here (CLAUDE.md §6): this file describes *what a signed-in
 * user is* in business terms, independently of Supabase, React or Next.
 */

export type UserStatus = "pending" | "active" | "suspended" | "rejected";
export type RoleScope = "admin" | "agent" | "driver";

/** The four protected system roles (CLAUDE.md §7). Custom roles are data. */
export const SYSTEM_ROLE_KEYS = ["super_admin", "staff", "agent_owner", "agent_user"] as const;
export type SystemRoleKey = (typeof SYSTEM_ROLE_KEYS)[number];

export type AuthenticatedUser = {
  id: string;
  email: string;
  fullName: string;
  status: UserStatus;
  preferredLocale: "ar" | "en";

  /**
   * True while the account still holds the temporary password an admin set for
   * it. The back-office layout diverts to the change-password screen until the
   * user replaces it, so an account never stays usable on a credential someone
   * else has seen.
   */
  mustChangePassword: boolean;

  role: {
    id: string;
    /** Machine key — may be a custom role, so never assume it is a SystemRoleKey. */
    key: string;
    scope: RoleScope;
    nameAr: string;
    nameEn: string;
  };

  /** Null for back-office staff. */
  agency: {
    id: string;
    code: string;
    name: string;
    status: UserStatus;
  } | null;

  /**
   * Resolved permission keys. Empty for a super_admin, whose access is
   * implicit — always ask through `can()`, never by inspecting this array,
   * or super_admin will read as having no access at all.
   */
  permissions: readonly string[];
};

/**
 * The single sanctioned way to ask what a user may do.
 *
 * Mirrors the database's has_permission(): super_admin short-circuits to true.
 * This is the application-layer half of CLAUDE.md §12's "re-check it
 * server-side" rule — RLS is the floor, this is the gate the UI and use-cases
 * consult before attempting anything.
 */
export function can(user: AuthenticatedUser | null, permission: string): boolean {
  if (!user || user.status !== "active") return false;
  // Mirrors has_permission(): an account still on a temporary password holds no
  // permissions. This matters most for use-cases that check `can()` and then
  // write with the service role, where the database never sees the caller.
  if (user.mustChangePassword) return false;
  if (user.role.key === "super_admin") return true;
  return user.permissions.includes(permission);
}

/**
 * Where a user belongs once signed in, given their role and account state.
 *
 * Every layout that turns someone away must send them HERE rather than to the
 * other side by name. With two scopes "not admin" meant "agent"; with three it
 * does not, and two layouts each assuming the other's audience is how a driver
 * ends up bouncing between /admin and /agent forever.
 */
export function landingPathFor(user: AuthenticatedUser): string {
  if (user.status !== "active") return "/pending";
  // Before any portal, whatever the scope: an account still on a temporary
  // password someone else has seen must replace it first.
  if (user.mustChangePassword) return "/change-password";
  if (user.role.scope === "admin") return "/admin";
  if (user.role.scope === "driver") return "/driver";
  return "/agent";
}

// ---------------------------------------------------------------- errors

export class AuthError extends Error {
  /** Message key resolved against the i18n catalogue, so errors stay bilingual. */
  constructor(
    public readonly messageKey: string,
    message?: string,
  ) {
    super(message ?? messageKey);
    this.name = "AuthError";
  }
}

export class InvalidCredentialsError extends AuthError {
  constructor() {
    super("auth.errors.invalidCredentials");
  }
}

export class EmailAlreadyRegisteredError extends AuthError {
  constructor() {
    super("auth.errors.emailTaken");
  }
}

export class RateLimitedError extends AuthError {
  constructor() {
    super("auth.errors.rateLimited");
  }
}
