"use server";

import { isIP } from "node:net";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can, type AuthenticatedUser } from "@/modules/auth/domain/user";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";
import { createServiceRoleClient } from "@/shared/lib/supabase/server";
import type { Json } from "@/shared/types/database";
import { generateApiKey } from "@/modules/b2b-api/infrastructure/api-auth.guard";

/**
 * API key management (Phase 10).
 *
 * Every write runs through here with the service role: `agency_api_keys` has
 * no write policy at all, so a key cannot be created, re-enabled or deleted
 * through PostgREST, only through a path that checks the permission and writes
 * the audit row. A key is booking power over an agency's credit.
 *
 * Who may manage an agency's keys is decided by PERMISSION, never by role name
 * or scope (§7): the agency's own `agency_users.manage` holder, or back-office
 * staff holding `agencies.update`.
 */

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

type ActionResult = { ok: true } | { ok: false; error: string };

function canManageKeys(user: AuthenticatedUser | null, agencyId: string): boolean {
  if (!user) return false;
  return (
    (can(user, "agency_users.manage") && user.agency?.id === agencyId) ||
    can(user, "agencies.update")
  );
}

function canViewKeys(user: AuthenticatedUser | null, agencyId: string): boolean {
  if (!user || user.status !== "active" || user.mustChangePassword) return false;
  return user.agency?.id === agencyId || can(user, "agencies.view");
}

const uuid = z.string().uuid();

const createKeySchema = z.object({
  agencyId: uuid,
  name: z.string().trim().min(2, "Key name must be at least 2 characters.").max(80),
  allowedIps: z
    .array(z.string().trim())
    .max(20, "At most 20 addresses can be allowed.")
    .refine((ips) => ips.every((ip) => isIP(ip) !== 0), {
      message: "Every allowed address must be a valid IPv4 or IPv6 address.",
    }),
});

async function audit(action: string, entityId: string, changes: Json) {
  const { error } = await createServiceRoleClient().rpc("write_audit", {
    p_action: action,
    p_entity_type: "agency_api_keys",
    p_entity_id: entityId,
    p_changes: changes,
  });
  // The change itself has happened; losing its audit row must at least be loud.
  if (error) console.error(`[b2b-api] audit ${action} failed:`, error.message);
}

function revalidateKeys() {
  revalidatePath("/[locale]/agent/developer", "page");
}

export async function listAgencyApiKeys(agencyId: string): Promise<ApiKeySummary[]> {
  const user = await getCurrentUser();
  if (!canViewKeys(user, agencyId)) return [];

  const { data: keys, error } = await createServiceRoleClient()
    .from("agency_api_keys")
    .select(
      "id, name, key_prefix, is_active, rate_limit_per_minute, allowed_ips, created_at, last_used_at, expires_at",
    )
    .eq("agency_id", agencyId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    // Rendering this as "no keys yet" would invite a second key nobody needs.
    console.error("[b2b-api] listing keys failed:", error.message);
    throw new Error("API keys could not be loaded.");
  }

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
  { ok: true; rawKey: string; keyPrefix: string; id: string } | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (!canManageKeys(user, agencyId)) {
    return { ok: false, error: "You do not have permission to manage this agency's API keys." };
  }

  const parsed = createKeySchema.safeParse({
    agencyId,
    name,
    allowedIps: (allowedIpsText ?? "")
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const { rawKey, keyPrefix, keyHash } = generateApiKey();
  const ips = parsed.data.allowedIps.length > 0 ? parsed.data.allowedIps : null;

  const { data, error } = await createServiceRoleClient()
    .from("agency_api_keys")
    .insert({
      agency_id: parsed.data.agencyId,
      name: parsed.data.name,
      key_prefix: keyPrefix,
      key_hash: keyHash,
      is_active: true,
      rate_limit_per_minute: 60,
      allowed_ips: ips,
      created_by: user!.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[b2b-api] creating key failed:", error?.message);
    return { ok: false, error: "The API key could not be saved." };
  }

  await audit("agency.api_key_created", data.id, {
    agency_id: parsed.data.agencyId,
    key_prefix: keyPrefix,
    name: parsed.data.name,
    allowed_ips: ips,
  });

  revalidateKeys();
  // The raw key is returned exactly once and never stored (only its hash is).
  return { ok: true, rawKey, keyPrefix, id: data.id };
}

export async function toggleApiKeyStatusAction(
  keyId: string,
  agencyId: string,
  isActive: boolean,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!uuid.safeParse(keyId).success || !uuid.safeParse(agencyId).success) {
    return { ok: false, error: "Invalid input." };
  }
  if (!canManageKeys(user, agencyId)) return { ok: false, error: "Permission denied." };

  const { data, error } = await createServiceRoleClient()
    .from("agency_api_keys")
    .update({ is_active: isActive })
    .eq("id", keyId)
    .eq("agency_id", agencyId)
    .select("id");

  if (error) {
    console.error("[b2b-api] toggling key failed:", error.message);
    return { ok: false, error: "The key could not be updated." };
  }
  // A filtered UPDATE that matched nothing returns no error (§15, 16.x).
  if (!data || data.length === 0) return { ok: false, error: "Key not found." };

  await audit(isActive ? "agency.api_key_enabled" : "agency.api_key_disabled", keyId, {
    agency_id: agencyId,
  });

  revalidateKeys();
  return { ok: true };
}

export async function deleteApiKeyAction(keyId: string, agencyId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!uuid.safeParse(keyId).success || !uuid.safeParse(agencyId).success) {
    return { ok: false, error: "Invalid input." };
  }
  if (!canManageKeys(user, agencyId)) return { ok: false, error: "Permission denied." };

  const { data, error } = await createServiceRoleClient()
    .from("agency_api_keys")
    .delete()
    .eq("id", keyId)
    .eq("agency_id", agencyId)
    .select("id, key_prefix, name");

  if (error) {
    console.error("[b2b-api] deleting key failed:", error.message);
    return { ok: false, error: "The key could not be deleted." };
  }
  const deleted = data?.[0];
  if (!deleted) return { ok: false, error: "Key not found." };

  await audit("agency.api_key_deleted", keyId, {
    agency_id: agencyId,
    key_prefix: deleted.key_prefix,
    name: deleted.name,
  });

  revalidateKeys();
  return { ok: true };
}
