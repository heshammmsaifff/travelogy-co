import { describe, it, expect } from "vitest";
import { can, landingPathFor, type AuthenticatedUser, type RoleScope } from "@/modules/auth/domain/user";

function user(scope: RoleScope, overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    email: "someone@example.com",
    fullName: "Someone",
    status: "active",
    preferredLocale: "ar",
    mustChangePassword: false,
    role: { id: "r", key: scope === "agent" ? "agent_user" : scope, scope, nameAr: "", nameEn: "" },
    agency: scope === "agent" ? { id: "a", code: "LLT-A-000001", name: "Agency", status: "active" } : null,
    permissions: [],
    ...overrides,
  };
}

describe("landingPathFor", () => {
  it("sends each active scope to its own portal", () => {
    expect(landingPathFor(user("admin"))).toBe("/admin");
    expect(landingPathFor(user("agent"))).toBe("/agent");
    expect(landingPathFor(user("driver"))).toBe("/driver");
  });

  it("sends an account on a temporary password to change it first — in EVERY scope", () => {
    // The agent scope is the one that was missing: the layouts for admin and
    // driver enforced it, the agent portal did not.
    for (const scope of ["admin", "agent", "driver"] as const) {
      expect(landingPathFor(user(scope, { mustChangePassword: true }))).toBe("/change-password");
    }
  });

  it("puts an inactive account on the pending screen before anything else", () => {
    expect(landingPathFor(user("agent", { status: "suspended", mustChangePassword: true }))).toBe(
      "/pending",
    );
  });
});

describe("can() and the temporary-password flag", () => {
  it("grants a held permission to an account that has chosen its own password", () => {
    expect(can(user("agent", { permissions: ["agency_users.manage"] }), "agency_users.manage")).toBe(true);
  });

  it("grants NOTHING while the account is still on a temporary password", () => {
    // Mirrors has_permission() in the database. Server actions that check can()
    // and then write with the service role depend on this, because the
    // database never sees who the caller was.
    expect(
      can(user("agent", { permissions: ["agency_users.manage"], mustChangePassword: true }), "agency_users.manage"),
    ).toBe(false);
  });

  it("does not let super_admin's implicit grant skip the rule", () => {
    const superAdmin = user("admin", { mustChangePassword: true });
    superAdmin.role = { ...superAdmin.role, key: "super_admin" };
    expect(can(superAdmin, "settings.roles.manage")).toBe(false);
  });
});
