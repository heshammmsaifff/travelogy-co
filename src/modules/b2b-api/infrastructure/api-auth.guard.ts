import "server-only";

import crypto from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/shared/lib/supabase/server";
import { rateLimit } from "@/shared/lib/rate-limit";
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
  clientIp: string;
};

export type AuthResult =
  | { ok: true; context: AuthenticatedB2BContext }
  | { ok: false; response: NextResponse };

/**
 * Computes SHA-256 hash of plaintext API key.
 */
export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key.trim()).digest("hex");
}

/**
 * Generates a cryptographically secure B2B API key.
 * Format: `llt_live_` + 32 hex characters.
 */
export function generateApiKey(): { rawKey: string; keyPrefix: string; keyHash: string } {
  const randomBytes = crypto.randomBytes(16).toString("hex");
  const rawKey = `llt_live_${randomBytes}`;
  const keyPrefix = `${rawKey.slice(0, 16)}...`;
  const keyHash = hashApiKey(rawKey);

  return { rawKey, keyPrefix, keyHash };
}

/**
 * Guards B2B API routes:
 * 1. Checks X-API-Key or Authorization Bearer header.
 * 2. Authenticates key against database with SHA-256 hash.
 * 3. Enforces optional IP whitelist.
 * 4. Enforces per-agency rate limits (HTTP 429).
 */
export async function authenticateB2BRequest(request: NextRequest): Promise<AuthResult> {
  // Extract token from header
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

  const tokenHash = hashApiKey(token);
  const supabase = createServiceRoleClient();

  const { data: authRows, error } = await supabase.rpc("authenticate_b2b_api_key", {
    p_key_hash: tokenHash,
  });

  if (error || !authRows || authRows.length === 0) {
    return {
      ok: false,
      response: b2bError("INVALID_API_KEY", "Invalid, expired, or inactive API key.", {
        status: 401,
      }),
    };
  }

  const row = authRows[0];
  if (!row) {
    return {
      ok: false,
      response: b2bError("INVALID_API_KEY", "Invalid, expired, or inactive API key.", {
        status: 401,
      }),
    };
  }

  if (row.agency_status !== "active") {
    return {
      ok: false,
      response: b2bError("AGENCY_SUSPENDED", "The agency associated with this key is not active.", {
        status: 403,
      }),
    };
  }

  // Extract client IP
  const forwardedFor = request.headers.get("x-forwarded-for");
  const clientIp = forwardedFor ? forwardedFor.split(",")[0]?.trim() || "unknown" : "127.0.0.1";

  // IP whitelist check
  if (row.allowed_ips && row.allowed_ips.length > 0) {
    const isAllowed = row.allowed_ips.some((ip: string) => ip.trim() === clientIp);
    if (!isAllowed) {
      return {
        ok: false,
        response: b2bError("IP_NOT_ALLOWED", `Client IP '${clientIp}' is not authorized.`, {
          status: 403,
        }),
      };
    }
  }

  // Rate Limiting
  const limit = row.rate_limit || 60;
  const rlKey = `b2b:${row.key_id}`;
  const rlResult = rateLimit(rlKey, { limit, windowMs: 60_000 });

  const context: AuthenticatedB2BContext = {
    keyId: row.key_id,
    agencyId: row.agency_id,
    agencyName: row.agency_name,
    agencyCode: row.agency_code,
    agencyStatus: row.agency_status,
    rateLimit: limit,
    remainingRequests: rlResult.allowed ? Math.max(0, limit - 1) : 0,
    resetSeconds: rlResult.retryAfterSeconds,
    clientIp,
  };

  if (!rlResult.allowed) {
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
