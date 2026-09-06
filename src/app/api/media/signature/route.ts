import { NextResponse } from "next/server";
import { z } from "zod";
import { createUploadSignature, UPLOAD_FOLDERS } from "@/shared/lib/cloudinary";
import { rateLimit } from "@/shared/lib/rate-limit";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";

/**
 * Issues a short-lived, single-use Cloudinary upload signature (CLAUDE.md §4).
 *
 * Thin by design (§6): validate input, call one helper, map to a response.
 *
 * ── Access control ──────────────────────────────────────────────────────────
 * Requires an active signed-in account. This closes the gap Phase 0 recorded
 * in CLAUDE.md §15: the endpoint mints signatures against a billable
 * Cloudinary account, so it must not be reachable anonymously.
 *
 * Defence in depth here is: an active session, a rate limit, and a folder that
 * is pinned server-side so a caller cannot choose an arbitrary upload path.
 * Phase 3 adds a per-folder permission check when real media features land.
 */

const requestSchema = z.object({
  folder: z.enum(Object.keys(UPLOAD_FOLDERS) as [keyof typeof UPLOAD_FOLDERS]),
});

export async function POST(request: Request) {
  // Signed-in and active, before anything else happens.
  const user = await getCurrentUser();
  if (!user || user.status !== "active") {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  // Cloudinary quota is billable, so cap how fast one account can mint
  // signatures. Keyed by user id now that there is one — an IP bucket is
  // trivially widened by anyone on a different connection.
  const rateKey = user.id;

  const limit = rateLimit(`media-signature:${rateKey}`, { limit: 20, windowMs: 60_000 });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many upload requests. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request.", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const signature = createUploadSignature(parsed.data.folder);
    // cloudName is intentionally omitted from the response: the client only
    // needs uploadUrl, and the name is already embedded in that.
    return NextResponse.json({
      signature: signature.signature,
      timestamp: signature.timestamp,
      apiKey: signature.apiKey,
      folder: signature.folder,
      uploadUrl: signature.uploadUrl,
    });
  } catch (error) {
    // Almost always a missing/invalid Cloudinary env var. Log the real reason
    // server-side; tell the client nothing about our configuration.
    console.error("[media/signature] Failed to create upload signature:", error);
    return NextResponse.json({ error: "Upload is not configured." }, { status: 500 });
  }
}
