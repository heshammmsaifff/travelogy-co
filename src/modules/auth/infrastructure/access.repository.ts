import "server-only";

import { createClient } from "@/shared/lib/supabase/server";

/**
 * Read models for the access-control screens.
 *
 * Every query runs through the caller's own session, so RLS decides what comes
 * back — these functions never widen access, they only shape it (CLAUDE.md §12).
 * Columns are listed explicitly and lists are bounded (§11).
 */

export type RoleSummary = {
  id: string;
  key: string;
  scope: "admin" | "agent" | "driver";
  nameAr: string;
  nameEn: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  isSystem: boolean;
  permissionCount: number;
  userCount: number;
};

export type PermissionRow = {
  key: string;
  module: string;
  nameAr: string;
  nameEn: string;
  sortOrder: number;
};

export async function listRoles(): Promise<RoleSummary[]> {
  const supabase = await createClient();

  // The two counts come back as embedded aggregates rather than N+1 queries.
  const { data } = await supabase
    .from("roles")
    .select(
      `id, key, scope, name_ar, name_en, description_ar, description_en, is_system,
       role_permissions(count),
       profiles(count)`,
    )
    .order("scope")
    .order("is_system", { ascending: false })
    .order("name_en");

  return (data ?? []).map((r) => ({
    id: r.id,
    key: r.key,
    scope: r.scope as "admin" | "agent" | "driver",
    nameAr: r.name_ar,
    nameEn: r.name_en,
    descriptionAr: r.description_ar,
    descriptionEn: r.description_en,
    isSystem: r.is_system,
    // PostgREST returns an aggregate as a one-element array.
    permissionCount: r.role_permissions?.[0]?.count ?? 0,
    userCount: r.profiles?.[0]?.count ?? 0,
  }));
}

export type AgentRoleOption = {
  id: string;
  key: string;
  nameAr: string;
  nameEn: string;
};

export async function listAgentRoles(): Promise<AgentRoleOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("roles")
    .select("id, key, name_ar, name_en")
    .eq("scope", "agent")
    .order("is_system", { ascending: false })
    .order("name_en");

  return (data ?? []).map((r) => ({
    id: r.id,
    key: r.key,
    nameAr: r.name_ar,
    nameEn: r.name_en,
  }));
}


export async function getRole(id: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("roles")
    .select("id, key, scope, name_ar, name_en, description_ar, description_en, is_system")
    .eq("id", id)
    .maybeSingle();

  if (!data) return null;

  const { data: grants } = await supabase
    .from("role_permissions")
    .select("permission_key")
    .eq("role_id", id);

  return {
    id: data.id,
    key: data.key,
    scope: data.scope as "admin" | "agent" | "driver",
    nameAr: data.name_ar,
    nameEn: data.name_en,
    descriptionAr: data.description_ar,
    descriptionEn: data.description_en,
    isSystem: data.is_system,
    permissionKeys: (grants ?? []).map((g) => g.permission_key),
  };
}

/** The full registry, grouped by module for the role-builder matrix (§7). */
export async function listPermissionsByModule(): Promise<Map<string, PermissionRow[]>> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("permissions")
    .select("key, module, name_ar, name_en, sort_order")
    .order("module")
    .order("sort_order");

  const grouped = new Map<string, PermissionRow[]>();
  for (const p of data ?? []) {
    const row: PermissionRow = {
      key: p.key,
      module: p.module,
      nameAr: p.name_ar,
      nameEn: p.name_en,
      sortOrder: p.sort_order,
    };
    const bucket = grouped.get(p.module);
    if (bucket) bucket.push(row);
    else grouped.set(p.module, [row]);
  }
  return grouped;
}

export type StaffRow = {
  id: string;
  email: string;
  fullName: string;
  status: string;
  roleId: string;
  roleNameAr: string;
  roleNameEn: string;
  roleKey: string;
  createdAt: string;
};

/** Back-office users only — agent-side accounts belong to the agencies screens. */
export async function listStaff(): Promise<StaffRow[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("profiles")
    .select(
      "id, email, full_name, status, role_id, created_at, roles!inner(key, scope, name_ar, name_en)",
    )
    .is("agency_id", null)
    .eq("roles.scope", "admin")
    .order("created_at", { ascending: false })
    .limit(200);

  return (data ?? []).map((p) => ({
    id: p.id,
    email: p.email,
    fullName: p.full_name,
    status: p.status,
    roleId: p.role_id,
    roleKey: p.roles.key,
    roleNameAr: p.roles.name_ar,
    roleNameEn: p.roles.name_en,
    createdAt: p.created_at,
  }));
}

export type AuditRow = {
  id: number;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  changes: unknown;
  createdAt: string;
};

export async function listAuditLog(
  limit = 50,
  offset = 0,
  options?: { entityType?: string; search?: string },
) {
  const supabase = await createClient();

  let query = supabase
    .from("audit_log")
    .select("id, actor_email, action, entity_type, entity_id, changes, created_at", {
      count: "exact",
    });

  if (options?.entityType && options.entityType !== "all") {
    query = query.eq("entity_type", options.entityType);
  }

  if (options?.search?.trim()) {
    const term = options.search.trim();
    query = query.or(`actor_email.ilike.%${term}%,action.ilike.%${term}%`);
  }

  const { data, count } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  return {
    rows: (data ?? []).map((r) => ({
      id: r.id,
      actorEmail: r.actor_email,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      changes: r.changes,
      createdAt: r.created_at,
    })) satisfies AuditRow[],
    total: count ?? 0,
  };
}
