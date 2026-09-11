import { type NextRequest } from "next/server";
import { authenticateB2BRequest } from "@/modules/b2b-api/infrastructure/api-auth.guard";
import { b2bError, b2bSuccess } from "@/modules/b2b-api/infrastructure/api-response";
import { getB2BBooking } from "@/modules/b2b-api/infrastructure/b2b-bookings.service";

export async function GET(
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

  try {
    const booking = await getB2BBooking(idOrRef, auth.context.agencyId);
    if (!booking) {
      return b2bError("BOOKING_NOT_FOUND", `Booking '${idOrRef}' not found for your agency.`, {
        status: 404,
        context: auth.context,
      });
    }

    return b2bSuccess(booking, { context: auth.context });
  } catch (err) {
    return b2bError(
      "FETCH_FAILED",
      err instanceof Error ? err.message : "Failed to retrieve booking.",
      { status: 500, context: auth.context },
    );
  }
}
