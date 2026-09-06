import { NextResponse } from "next/server";
import { z } from "zod";
import { createUploadSignature, UPLOAD_FOLDERS } from "@/shared/lib/cloudinary";
import { rateLimit } from "@/shared/lib/rate-limit";

/**
 * Issues a short-lived, single-use Cloudinary upload signature (CLAUDE.md §4).
 *
 * Thin by design (§6): validate input, call one helper, map to a response.
 *
 * ── Access control status ────────────────────────────────────────────────────
 * This endpoint is currently UNAUTHENTICATED, because Supabase Auth does not
 * exist until Phase 1. That is a known, deliberate gap for Phase 0, mitigated
 * here by a rate limit and by the fact that the signed folder is fixed
 * server-side (a caller cannot pick an arbitrary upload path).
 *
 * Phase 1 MUST add a session check here before any real media feature ships in
 * Phase 3. This comment is the marker for that.
 */

const requestSchema = z.object({
  folder: z.enum(Object.keys(UPLOAD_FOLDERS) as [keyof typeof UPLOAD_FOLDERS]),
});

export async function POST(request: Request) {
  // Cloudinary quota is billable, so cap how fast one client can mint signatures.
  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  if (!rateLimit(`media-signature:${clientIp}`, { limit: 20, windowMs: 60_000 })) {
    return NextResponse.json(
      { error: "Too many upload requests. Try again shortly." },
      { status: 429 },
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
