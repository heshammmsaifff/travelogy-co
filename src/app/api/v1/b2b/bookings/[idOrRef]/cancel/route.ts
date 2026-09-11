import { type NextRequest } from "next/server";
import { authenticateB2BRequest } from "@/modules/b2b-api/infrastructure/api-auth.guard";
import { b2bError, b2bSuccess } from "@/modules/b2b-api/infrastructure/api-response";
import { cancelB2BBooking } from "@/modules/b2b-api/infrastructure/b2b-bookings.service";

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

  let reason: string | undefined;
  try {
    const body = (await request.json().catch(() => ({}))) as { reason?: string };
    reason = body?.reason;
  } catch {
    // optional body
  }

  try {
    const result = await cancelB2BBooking(idOrRef, auth.context.agencyId, reason);
    return b2bSuccess(result, { context: auth.context });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to cancel booking.";
    const status = msg.includes("not found") ? 404 : 400;

    return b2bError("CANCELLATION_REJECTED", msg, {
      status,
      context: auth.context,
    });
  }
}
