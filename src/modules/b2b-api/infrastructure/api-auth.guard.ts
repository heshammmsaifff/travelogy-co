import "server-only";

import crypto from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/shared/lib/supabase/server";
import { rateLimit } from "@/shared/lib/rate-limit";
import { resolveClientIp } from "@/shared/lib/client-ip";
import { b2bError } from "./api-response";

export type AuthenticatedB2BContext = {
  keyId: string;
  agencyId: string;
  agencyName: string;
  agencyCode: string;
  agencyStatus: string;
  rateLimit: number;
  remainingRequests: number;
  resetSeconds: number;
  /** Null on a direct connection with no proxy header (e.g. `next dev`). */
  clientIp: string | null;
};

export type AuthResult =
  | { ok: true; context: AuthenticatedB2BContext }
  | { ok: false; response: NextResponse };

/**
 * Computes SHA-256 hash of plaintext API key. Only the hash is stored, so a
 * database read never yields a usable key.
 */
export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key.trim()).digest("hex");
}

/**
 * Generates a cryptographically secure B2B API key.
 * Format: `llt_live_` + 32 hex characters (128 bits of entropy).
 */
export function generateApiKey(): { rawKey: string; keyPrefix: string; keyHash: string } {
  const randomBytes = crypto.randomBytes(16).toString("hex");
  const rawKey = `llt_live_${randomBytes}`;
  const keyPrefix = `${rawKey.slice(0, 16)}...`;
  const keyHash = hashApiKey(rawKey);

  return { rawKey, keyPrefix, keyHash };
}

const invalidKey = () =>
  b2bError("INVALID_API_KEY", "Invalid, expired, or inactive API key.", { status: 401 });

/**
 * Guards B2B API routes:
 * 1. Reads the key from X-API-Key or `Authorization: Bearer`.
 * 2. Authenticates its SHA-256 hash against the database.
 * 3. Refuses a key whose agency is not active.
 * 4. Enforces the key's IP allow-list, failing CLOSED when no address is known.
 * 5. Enforces the key's per-minute rate limit (HTTP 429).
 *
 * The context it returns carries the key id; the booking RPC resolves the
 * agency from that id inside the database, so nothing downstream can charge a
 * different agency than the one the key belongs to.
 */
export async function authenticateB2BRequest(request: NextRequest): Promise<AuthResult> {
  let token = request.headers.get("x-api-key");
  if (!token) {
    const authHeader = request.headers.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7).trim();
    }
  }

  if (!token) {
    return {
      ok: false,
      response: b2bError("AUTH_REQUIRED", "Missing API key in X-API-Key or Authorization header.", {
        status: 401,
      }),
    };
  }

  const supabase = createServiceRoleClient();
  const { data: authRows, error } = await supabase.rpc("authenticate_b2b_api_key", {
    p_key_hash: hashApiKey(token),
  });

  if (error) {
    // A database failure is not an invalid key, and the caller should not be
    // told to go and check their key when the fault is ours.
    console.error("[b2b-api] authenticate_b2b_api_key failed:", error.message);
    return {
      ok: false,
      response: b2bError("AUTH_UNAVAILABLE", "Authentication is temporarily unavailable.", {
        status: 503,
      }),
    };
  }

  const row = authRows?.[0];
  if (!row) return { ok: false, response: invalidKey() };

  if (row.agency_status !== "active") {
    return {
      ok: false,
      response: b2bError("AGENCY_SUSPENDED", "The agency associated with this key is not active.", {
        status: 403,
      }),
    };
  }

  const clientIp = resolveClientIp(request.headers);

  if (row.allowed_ips && row.allowed_ips.length > 0) {
    const isAllowed = clientIp !== null && row.allowed_ips.some((ip) => ip.trim() === clientIp);
    if (!isAllowed) {
      return {
        ok: false,
        response: b2bError("IP_NOT_ALLOWED", "This client address is not on the key's allow-list.", {
          status: 403,
        }),
      };
    }
  }

  const limit = row.rate_limit || 60;
  const rl = rateLimit(`b2b:${row.key_id}`, { limit, windowMs: 60_000 });

  const context: AuthenticatedB2BContext = {
    keyId: row.key_id,
    agencyId: row.agency_id,
    agencyName: row.agency_name,
    agencyCode: row.agency_code,
    agencyStatus: row.agency_status,
    rateLimit: limit,
    remainingRequests: rl.remaining,
    resetSeconds: rl.retryAfterSeconds,
    clientIp,
  };

  if (!rl.allowed) {
    return {
      ok: false,
      response: b2bError("RATE_LIMIT_EXCEEDED", "Request quota exceeded. Please slow down.", {
        status: 429,
        context,
      }),
    };
  }

  return { ok: true, context };
}
