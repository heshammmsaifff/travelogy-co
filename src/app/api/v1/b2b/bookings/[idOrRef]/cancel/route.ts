import { type NextRequest } from "next/server";
import { z } from "zod";
import { authenticateB2BRequest } from "@/modules/b2b-api/infrastructure/api-auth.guard";
import { b2bError, b2bSuccess } from "@/modules/b2b-api/infrastructure/api-response";
import {
  B2BApiError,
  cancelB2BBooking,
} from "@/modules/b2b-api/infrastructure/b2b-bookings.service";

// The body is optional; when present it must be well-formed.
const cancelBodySchema = z.object({ reason: z.string().trim().max(500).optional() });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ idOrRef: string }> },
) {
  const auth = await authenticateB2BRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { idOrRef } = await params;
  if (!idOrRef) {
    return b2bError("PARAM_REQUIRED", "Booking ID or reference must be provided.", {
      status: 400,
      context: auth.context,
    });
  }

  const raw = await request.text();
  let reason: string | undefined;
  if (raw.trim()) {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return b2bError("INVALID_JSON", "Request body must be valid JSON.", {
        status: 400,
        context: auth.context,
      });
    }
    const parsed = cancelBodySchema.safeParse(json);
    if (!parsed.success) {
      return b2bError("VALIDATION_ERROR", "Cancellation payload validation failed.", {
        status: 400,
        context: auth.context,
        details: parsed.error.format(),
      });
    }
    reason = parsed.data.reason || undefined;
  }

  try {
    const result = await cancelB2BBooking(idOrRef, auth.context.agencyId, reason);
    return b2bSuccess(result, { context: auth.context });
  } catch (err) {
    if (err instanceof B2BApiError) {
      return b2bError(err.code, err.message, { status: err.status, context: auth.context });
    }
    console.error("[b2b-api] POST /bookings/:id/cancel:", err);
    return b2bError("CANCELLATION_FAILED", "The booking could not be cancelled.", {
      status: 500,
      context: auth.context,
    });
  }
}
