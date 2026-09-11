"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import { createServiceRoleClient } from "@/shared/lib/supabase/server";
import { generateApiKey } from "@/modules/b2b-api/infrastructure/api-auth.guard";

export type ApiKeySummary = {
  id: string;
  name: string;
  keyPrefix: string;
  isActive: boolean;
  rateLimitPerMinute: number;
  allowedIps: string[] | null;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
};

export async function listAgencyApiKeys(agencyId: string): Promise<ApiKeySummary[]> {
  const user = await getCurrentUser();
  if (!user || user.status !== "active") return [];

  // Security: only user's own agency or admin
  const isOwnAgency = user.agency?.id === agencyId;
  const isAdmin = user.role.scope === "admin";
  if (!isOwnAgency && !isAdmin) return [];

  const supabase = createServiceRoleClient();
  const { data: keys } = await supabase
    .from("agency_api_keys")
    .select(
      "id, name, key_prefix, is_active, rate_limit_per_minute, allowed_ips, created_at, last_used_at, expires_at",
    )
    .eq("agency_id", agencyId)
    .order("created_at", { ascending: false });

  return (keys ?? []).map((k) => ({
    id: k.id,
    name: k.name,
    keyPrefix: k.key_prefix,
    isActive: k.is_active,
    rateLimitPerMinute: k.rate_limit_per_minute,
    allowedIps: k.allowed_ips,
    createdAt: k.created_at,
    lastUsedAt: k.last_used_at,
    expiresAt: k.expires_at,
  }));
}

export async function createAgencyApiKeyAction(
  agencyId: string,
  name: string,
  allowedIpsText?: string,
): Promise<
  | { ok: true; rawKey: string; keyPrefix: string; id: string }
  | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user || user.status !== "active") {
    return { ok: false, error: "Unauthorized." };
  }

  // Only agent_owner or admin
  const isOwner = user.role.key === "agent_owner" && user.agency?.id === agencyId;
  const isAdmin = user.role.scope === "admin";
  if (!isOwner && !isAdmin) {
    return { ok: false, error: "Only agency owners or administrators can generate API keys." };
  }

  if (!name || name.trim().length < 2) {
    return { ok: false, error: "Key name must be at least 2 characters." };
  }

  const ips = allowedIpsText
    ? allowedIpsText
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    : null;

  const { rawKey, keyPrefix, keyHash } = generateApiKey();
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("agency_api_keys")
    .insert({
      agency_id: agencyId,
      name: name.trim(),
      key_prefix: keyPrefix,
      key_hash: keyHash,
      is_active: true,
      rate_limit_per_minute: 60,
      allowed_ips: ips,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message || "Failed to save API key." };
  }

  // Audit log
  await supabase.rpc("write_audit", {
    p_action: "agency.api_key_created",
    p_entity_type: "agency_api_keys",
    p_entity_id: data.id,
    p_metadata: {
      agency_id: agencyId,
      key_prefix: keyPrefix,
      name: name.trim(),
    },
  });

  revalidatePath("/[locale]/agent/developer", "page");
  return { ok: true, rawKey, keyPrefix, id: data.id };
}

export async function toggleApiKeyStatusAction(
  keyId: string,
  agencyId: string,
  isActive: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user || user.status !== "active") {
    return { ok: false, error: "Unauthorized." };
  }

  const isOwner = user.role.key === "agent_owner" && user.agency?.id === agencyId;
  const isAdmin = user.role.scope === "admin";
  if (!isOwner && !isAdmin) {
    return { ok: false, error: "Permission denied." };
  }

  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("agency_api_keys")
    .update({ is_active: isActive })
    .eq("id", keyId)
    .eq("agency_id", agencyId);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/[locale]/agent/developer", "page");
  return { ok: true };
}

export async function deleteApiKeyAction(
  keyId: string,
  agencyId: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user || user.status !== "active") {
    return { ok: false, error: "Unauthorized." };
  }

  const isOwner = user.role.key === "agent_owner" && user.agency?.id === agencyId;
  const isAdmin = user.role.scope === "admin";
  if (!isOwner && !isAdmin) {
    return { ok: false, error: "Permission denied." };
  }

  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("agency_api_keys")
    .delete()
    .eq("id", keyId)
    .eq("agency_id", agencyId);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/[locale]/agent/developer", "page");
  return { ok: true };
}
